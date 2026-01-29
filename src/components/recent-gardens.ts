/**
 * <recent-gardens> - Displays recent garden activity on the main page
 *
 * Shows gardens with recent flower activity, discovered through:
 * - Jetstream: Real-time events from across the AT Protocol network
 * - Constellation backlinks: Historical flower interactions
 */

import { getProfile, getRecord } from '../at-client';
import { hasGardenIdentifierInUrl } from '../config';
import { generateThemeFromDid } from '../themes/engine';
import { getJetstreamClient, type GardenDiscoveryEvent } from '../jetstream';
import './did-visualization';

/**
 * Garden metadata interface
 */
interface GardenMetadata {
  did: string;
  handle?: string;
  title?: string;
  subtitle?: string;
  lastUpdated: Date;
  updateType?: 'flower' | 'seedling' | 'edit' | 'spore';
}

// Hypha's own gardens for bootstrapping discovery
// These are known active gardens that help kickstart the discovery network
const SEED_GARDENS = [
  'did:plc:hkjuufd7obvrorwc4fjynbwr', // andia.bsky.social
  'did:plc:y3lae7hmqiwyq7w2v3bcb2c2', // charlebois.info
  'did:plc:rxduhzsfgfpl2glle7vagcwl', // hypha.coop
  'did:plc:2qt2kdxo6viizgglawlm4l3n', // lexa.fyi
  'did:plc:gspui4hkqdes4maykfp7cm5y', // udit.bsky.social

];

/**
 * Cached activity for a garden (persists across page loads)
 */
interface CachedActivity {
  updateType: GardenMetadata['updateType'];
  timestamp: number; // ms since epoch
}

/**
 * Cache of recent activity per garden DID
 */
function getCachedActivity(did: string): CachedActivity | null {
  try {
    const stored = localStorage.getItem('spores.garden.activityCache');
    if (stored) {
      const cache = JSON.parse(stored) as Record<string, CachedActivity>;
      return cache[did] || null;
    }
  } catch {
    // Ignore
  }
  return null;
}

/**
 * Save activity to cache
 */
function setCachedActivity(did: string, updateType: GardenMetadata['updateType'], timestamp: Date) {
  try {
    const stored = localStorage.getItem('spores.garden.activityCache');
    const cache: Record<string, CachedActivity> = stored ? JSON.parse(stored) : {};
    
    cache[did] = {
      updateType: updateType || 'flower',
      timestamp: timestamp.getTime()
    };
    
    // Keep cache size reasonable (max 50 entries)
    const entries = Object.entries(cache);
    if (entries.length > 50) {
      // Remove oldest entries
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const newCache: Record<string, CachedActivity> = {};
      entries.slice(-50).forEach(([k, v]) => newCache[k] = v);
      localStorage.setItem('spores.garden.activityCache', JSON.stringify(newCache));
    } else {
      localStorage.setItem('spores.garden.activityCache', JSON.stringify(cache));
    }
  } catch {
    // Ignore
  }
}

/**
 * Register a garden DID as known (for discovery)
 */
export function registerGarden(did: string) {
  try {
    const stored = localStorage.getItem('spores.garden.knownGardens');
    const dids: string[] = stored ? JSON.parse(stored) : [];
    
    if (!dids.includes(did)) {
      dids.push(did);
      localStorage.setItem('spores.garden.knownGardens', JSON.stringify(dids));
    }
  } catch (error) {
    console.warn('Failed to register garden:', error);
  }
}

/**
 * Load known gardens from localStorage
 */
function loadKnownGardens(): string[] {
  try {
    const stored = localStorage.getItem('spores.garden.knownGardens');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Handle legacy versioned format
      if (typeof parsed === 'object' && parsed.dids) {
        return parsed.dids;
      }
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (error) {
    console.warn('Failed to load known gardens:', error);
  }
  return [];
}

/**
 * Save known gardens to localStorage
 */
function saveKnownGardens(dids: string[]) {
  try {
    localStorage.setItem('spores.garden.knownGardens', JSON.stringify(dids));
  } catch (error) {
    console.warn('Failed to save known gardens:', error);
  }
}

class RecentGardens extends HTMLElement {
  private gardens: GardenMetadata[] = [];
  private knownGardenDids: string[] = [];
  private loading = false;
  private jetstreamUnsubscribe: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;
  private lastLoadTime = 0;
  
  // Batching for efficient historical event processing
  private pendingEvents: Map<string, GardenDiscoveryEvent> = new Map();
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;
  private historicalReplayDone = false; // Set true when we see a recent event

  static get observedAttributes() {
    return ['data-limit', 'data-show-empty'];
  }

  connectedCallback() {
    this.loadGardens();
    this.setupJetstream();
    this.setupVisibilityHandler();
  }

  disconnectedCallback() {
    if (this.jetstreamUnsubscribe) {
      this.jetstreamUnsubscribe();
      this.jetstreamUnsubscribe = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue !== newValue && this.isConnected) {
      this.loadGardens();
    }
  }

  /**
   * Set up Jetstream for real-time garden discovery
   */
  private setupJetstream() {
    const client = getJetstreamClient();
    
    this.jetstreamUnsubscribe = client.onDiscovery((event: GardenDiscoveryEvent) => {
      this.handleJetstreamEvent(event);
    });

    // Connect if not already connected
    if (!client.isConnected()) {
      client.connect();
    }
  }

  /**
   * Handle incoming Jetstream events
   *
   * Activity is attributed to the RECORD CREATOR (event.did):
   * - flower: someone planted a flower → show planter's garden
   * - seedling: someone picked a flower → show picker's garden
   * - edit: someone created/edited garden → show that garden
   */
  private handleJetstreamEvent(event: GardenDiscoveryEvent) {
    if (!this.isMainPage()) return;

    console.log('[RecentGardens] Jetstream event:', event.collection, event.did, event.timestamp);

    const gardenDid = event.did;
    const eventAge = Date.now() - event.timestamp.getTime();
    const isRealTime = eventAge < 60000; // Event from last 60 seconds = real-time
    
    // Once we see a real-time event, historical replay is done
    if (isRealTime && !this.historicalReplayDone) {
      this.historicalReplayDone = true;
      // Flush any pending historical events
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
        this.batchTimeout = null;
      }
      if (this.pendingEvents.size > 0) {
        this.processBatchedEvents();
      }
    }
    
    // Real-time: process immediately
    if (this.historicalReplayDone) {
      this.processEventImmediate(event);
      return;
    }
    
    // Historical: batch and deduplicate by DID (keep most recent per DID)
    const existing = this.pendingEvents.get(gardenDid);
    if (!existing || event.timestamp > existing.timestamp) {
      this.pendingEvents.set(gardenDid, event);
    }
    
    // Longer debounce for historical events (2 seconds)
    if (this.batchTimeout) clearTimeout(this.batchTimeout);
    this.batchTimeout = setTimeout(() => {
      this.processBatchedEvents();
    }, 2000);
  }

  /**
   * Process batched historical events efficiently
   */
  private async processBatchedEvents() {
    const events = Array.from(this.pendingEvents.values());
    this.pendingEvents.clear();

    console.log('[RecentGardens] Processing batched events:', events.length);

    if (events.length === 0) return;
    
    // Sort by timestamp (most recent first)
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // Filter out DIDs we already have with newer data
    const newEvents = events.filter(event => {
      const existing = this.gardens.find(g => g.did === event.did);
      return !existing || event.timestamp > existing.lastUpdated;
    });
    
    if (newEvents.length === 0) return;
    
    const limit = parseInt(this.getAttribute('data-limit') || '12', 10);
    const topEvents = newEvents.slice(0, limit);
    
    // Process all events in parallel
    const gardenPromises = topEvents.map(async (event) => {
      const updateType = this.getUpdateTypeFromCollection(event.collection);
      
      if (!this.knownGardenDids.includes(event.did)) {
        this.knownGardenDids.push(event.did);
      }
      
      const garden: GardenMetadata = {
        did: event.did,
        lastUpdated: event.timestamp,
        updateType,
      };
      
      setCachedActivity(event.did, updateType, event.timestamp);
      
      // Reuse existing profile if we have it
      const existing = this.gardens.find(g => g.did === event.did);
      if (existing?.handle) {
        garden.handle = existing.handle;
        garden.title = existing.title;
        garden.subtitle = existing.subtitle;
      } else {
        try {
          const profile = await getProfile(event.did);
          garden.handle = profile.handle;
          garden.title = profile.displayName || profile.handle;
          garden.subtitle = `@${profile.handle}`;
        } catch {
          garden.title = event.did;
        }
      }
      
      return garden;
    });
    
    const newGardens = await Promise.all(gardenPromises);
    
    // Merge: update existing or add new
    for (const garden of newGardens) {
      const existingIndex = this.gardens.findIndex(g => g.did === garden.did);
      if (existingIndex >= 0) {
        this.gardens[existingIndex] = garden;
      } else {
        this.gardens.push(garden);
      }
    }
    
    // Sort and trim
    this.gardens.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
    this.gardens = this.gardens.slice(0, limit);
    
    saveKnownGardens(this.knownGardenDids);
    this.render();
  }

  /**
   * Process a single event immediately (real-time mode)
   */
  private async processEventImmediate(event: GardenDiscoveryEvent) {
    const gardenDid = event.did;
    const updateType = this.getUpdateTypeFromCollection(event.collection);

    // For non-config records, verify the user has a garden
    if (updateType !== 'edit') {
      try {
        const configRecord = await getRecord(gardenDid, 'garden.spores.site.config', 'self', { useSlingshot: true });
        if (!configRecord?.value) return;
      } catch {
        return;
      }
    }

    // Add to known gardens
    if (!this.knownGardenDids.includes(gardenDid)) {
      this.knownGardenDids.push(gardenDid);
      saveKnownGardens(this.knownGardenDids);
    }

    // Find existing or create new
    const existingIndex = this.gardens.findIndex(g => g.did === gardenDid);
    
    const newGarden: GardenMetadata = {
      did: gardenDid,
      lastUpdated: event.timestamp,
      updateType,
    };

    // Reuse existing profile data if available
    if (existingIndex >= 0) {
      const existing = this.gardens[existingIndex];
      newGarden.handle = existing.handle;
      newGarden.title = existing.title;
      newGarden.subtitle = existing.subtitle;
    } else {
      // Fetch profile for new garden
      try {
        const profile = await getProfile(gardenDid);
        newGarden.handle = profile.handle;
        newGarden.title = profile.displayName || profile.handle;
        newGarden.subtitle = `@${profile.handle}`;
      } catch {
        newGarden.title = gardenDid;
      }
    }

    setCachedActivity(gardenDid, updateType, event.timestamp);

    if (existingIndex >= 0) {
      this.gardens[existingIndex] = newGarden;
    } else {
      this.gardens.unshift(newGarden);
    }

    this.gardens.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
    const limit = parseInt(this.getAttribute('data-limit') || '12', 10);
    this.gardens = this.gardens.slice(0, limit);

    this.render();
  }

  /**
   * Get update type from collection name
   */
  private getUpdateTypeFromCollection(collection: string): GardenMetadata['updateType'] {
    if (collection === 'garden.spores.site.config') return 'edit';
    if (collection === 'garden.spores.social.takenFlower') return 'seedling';
    if (collection === 'garden.spores.item.specialSpore') return 'spore';
    return 'flower';
  }

  /**
   * Set up visibility change handler
   */
  private setupVisibilityHandler() {
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        // Only refresh if lastLoadTime has been set (not initial 0) and it's been > 5 minutes
        if (this.lastLoadTime > 0) {
          const timeSinceLastLoad = Date.now() - this.lastLoadTime;
          if (timeSinceLastLoad > 5 * 60 * 1000 && !this.loading) {
            this.loadGardens();
          }
        }
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  /**
   * Check if we're on the main page
   */
  private isMainPage(): boolean {
    return !hasGardenIdentifierInUrl();
  }

  /**
   * Load recent gardens from flower interactions
   */
  private async loadGardens() {
    if (!this.isMainPage()) {
      this.style.display = 'none';
      return;
    }

    this.style.display = 'block';
    this.loading = true;
    this.render();

    try {
      // Load known gardens, seeding if needed
      this.knownGardenDids = loadKnownGardens();
      console.log('[RecentGardens] Known gardens from localStorage:', this.knownGardenDids.length);
      if (this.knownGardenDids.length === 0) {
        this.knownGardenDids = [...SEED_GARDENS];
        saveKnownGardens(this.knownGardenDids);
        console.log('[RecentGardens] Seeded with:', SEED_GARDENS);
      }

      // Add current user if logged in
      try {
        const { getCurrentDid } = await import('../oauth');
        const currentDid = getCurrentDid();
        if (currentDid && !this.knownGardenDids.includes(currentDid)) {
          this.knownGardenDids.push(currentDid);
          saveKnownGardens(this.knownGardenDids);
        }
      } catch {
        // Not logged in
      }

      // Discover gardens from flower records
      const limit = parseInt(this.getAttribute('data-limit') || '12', 10);
      const discovered = await this.discoverGardensFromFlowers(limit);
      console.log('[RecentGardens] Discovered from flowers:', discovered.length);

      // Merge with any gardens already found via Jetstream (don't overwrite)
      for (const garden of discovered) {
        const existingIndex = this.gardens.findIndex(g => g.did === garden.did);
        if (existingIndex >= 0) {
          // Keep the newer one
          if (garden.lastUpdated > this.gardens[existingIndex].lastUpdated) {
            this.gardens[existingIndex] = garden;
          }
        } else {
          this.gardens.push(garden);
        }
      }

      // Sort and trim
      this.gardens.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
      this.gardens = this.gardens.slice(0, limit);

      // Enrich with profile data
      await this.enrichGardens();

      console.log('[RecentGardens] Total gardens after merge:', this.gardens.length);
      this.lastLoadTime = Date.now();
    } catch (error) {
      console.error('Failed to load recent gardens:', error);
      this.gardens = [];
    } finally {
      this.loading = false;
      this.render();
    }
  }

  /**
   * Discover gardens by finding flower plantings (PARALLEL)
   * Activity is attributed to the FLOWER PLANTER (record creator), not the recipient
   *
   * IMPORTANT: Always returns verified seed gardens as fallback, even without flowers
   */
  private async discoverGardensFromFlowers(limit: number): Promise<GardenMetadata[]> {
    try {
      const { listRecords } = await import('../at-client');
      const gardensToCheck = this.knownGardenDids.slice(0, 10);

      // Step 1: Verify ALL seed gardens have valid configs + fetch flower records IN PARALLEL
      const verificationResults = await Promise.all(
        gardensToCheck.map(async (gardenDid) => {
          try {
            // Check for config record (verifies it's a real garden)
            const configRecord = await getRecord(gardenDid, 'garden.spores.site.config', 'self', { useSlingshot: true });
            const hasConfig = !!configRecord?.value;

            // Get config creation time from record metadata (indexedAt) or value
            let configTimestamp: Date | null = null;
            if (hasConfig && configRecord) {
              // Try indexedAt from record metadata first, then createdAt from value
              const indexedAt = (configRecord as any).indexedAt;
              const createdAt = (configRecord.value as any)?.createdAt;
              if (indexedAt) {
                configTimestamp = new Date(indexedAt);
              } else if (createdAt) {
                configTimestamp = new Date(createdAt);
              }
            }

            // Fetch all activity types in parallel
            let flowerRecords = null;
            let takenFlowerRecords = null;
            let sporeRecords = null;
            if (hasConfig) {
              const [flowers, takenFlowers, spores] = await Promise.all([
                listRecords(gardenDid, 'garden.spores.social.flower', { limit: 5 }, null).catch(() => null),
                listRecords(gardenDid, 'garden.spores.social.takenFlower', { limit: 5 }, null).catch(() => null),
                listRecords(gardenDid, 'garden.spores.item.specialSpore', { limit: 5 }, null).catch(() => null),
              ]);
              flowerRecords = flowers;
              takenFlowerRecords = takenFlowers;
              sporeRecords = spores;
            }

            return { gardenDid, hasConfig, configTimestamp, flowerRecords, takenFlowerRecords, sporeRecords };
          } catch {
            return { gardenDid, hasConfig: false, configTimestamp: null, flowerRecords: null, takenFlowerRecords: null, sporeRecords: null };
          }
        })
      );

      // Step 2: Collect verified gardens and discover new DIDs from flower subjects
      const verifiedGardens: GardenMetadata[] = [];
      const newKnownDids: string[] = [];

      for (const { gardenDid, hasConfig, configTimestamp, flowerRecords, takenFlowerRecords, sporeRecords } of verificationResults) {
        if (!hasConfig) continue; // Not a real garden

        // Check cached activity
        const cached = getCachedActivity(gardenDid);

        // Collect all activity timestamps with their types
        const activities: Array<{ timestamp: Date; type: GardenMetadata['updateType'] }> = [];

        // Check flower records
        if (flowerRecords?.records && flowerRecords.records.length > 0) {
          const mostRecentFlower = flowerRecords.records[0];
          const createdAt = mostRecentFlower.value?.createdAt;
          if (createdAt) {
            activities.push({ timestamp: new Date(createdAt), type: 'flower' });
          }

          // Collect flower subjects for future discovery
          for (const record of flowerRecords.records) {
            const subjectDid = record.value?.subject;
            if (subjectDid && subjectDid !== gardenDid && !this.knownGardenDids.includes(subjectDid)) {
              newKnownDids.push(subjectDid);
            }
          }
        }

        // Check takenFlower records
        if (takenFlowerRecords?.records && takenFlowerRecords.records.length > 0) {
          const mostRecentTaken = takenFlowerRecords.records[0];
          const createdAt = mostRecentTaken.value?.createdAt;
          if (createdAt) {
            activities.push({ timestamp: new Date(createdAt), type: 'seedling' });
          }
        }

        // Check specialSpore records
        if (sporeRecords?.records && sporeRecords.records.length > 0) {
          const mostRecentSpore = sporeRecords.records[0];
          const createdAt = mostRecentSpore.value?.createdAt;
          if (createdAt) {
            activities.push({ timestamp: new Date(createdAt), type: 'spore' });
          }
        }

        // Check config timestamp
        if (configTimestamp) {
          activities.push({ timestamp: configTimestamp, type: 'edit' });
        }

        // Check cached activity
        if (cached) {
          activities.push({ timestamp: new Date(cached.timestamp), type: cached.updateType });
        }

        // Determine most recent activity
        let lastUpdated: Date;
        let updateType: GardenMetadata['updateType'] = undefined;

        if (activities.length > 0) {
          // Sort by timestamp descending and pick the most recent
          activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
          lastUpdated = activities[0].timestamp;
          updateType = activities[0].type;
        } else {
          // No timestamp available - use epoch to indicate unknown
          lastUpdated = new Date(0);
          updateType = 'edit';
        }

        verifiedGardens.push({
          did: gardenDid,
          lastUpdated,
          updateType,
        });
      }

      // Add new known DIDs
      if (newKnownDids.length > 0) {
        this.knownGardenDids.push(...newKnownDids);
        saveKnownGardens(this.knownGardenDids);
      }

      console.log('[RecentGardens] Verified gardens:', verifiedGardens.length);

      // Sort by activity (gardens with activity first, then by timestamp)
      verifiedGardens.sort((a, b) => {
        // Gardens with real activity come first
        const aHasActivity = a.lastUpdated.getTime() > 0;
        const bHasActivity = b.lastUpdated.getTime() > 0;
        if (aHasActivity && !bHasActivity) return -1;
        if (!aHasActivity && bHasActivity) return 1;
        // Then sort by timestamp
        return b.lastUpdated.getTime() - a.lastUpdated.getTime();
      });

      return verifiedGardens.slice(0, limit);
    } catch (error) {
      console.warn('Error discovering gardens from flowers:', error);
      return [];
    }
  }

  /**
   * Enrich garden metadata with profile information (PARALLEL)
   */
  private async enrichGardens() {
    await Promise.all(
      this.gardens.map(async (garden) => {
        try {
          const profile = await getProfile(garden.did);
          garden.handle = profile.handle;
          garden.title = garden.title || profile.displayName || profile.handle;
          if (!garden.subtitle && profile.handle) {
            garden.subtitle = `@${profile.handle}`;
          }
        } catch {
          garden.title = garden.title || garden.did;
        }
      })
    );
  }

  /**
   * Format relative time
   */
  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }

  /**
   * Get update type icon
   */
  private getUpdateTypeIcon(updateType?: string): string {
    switch (updateType) {
      case 'flower': return '🌸';
      case 'seedling': return '🌱';
      case 'edit': return '✏️';
      case 'spore': return '🍄';
      default: return '✨';
    }
  }

  private render() {
    const showEmpty = this.getAttribute('data-show-empty') === 'true';

    if (this.loading) {
      this.innerHTML = `
        <section class="recent-gardens">
          <h2 class="recent-gardens-title">Loading Activity...</h2>
        </section>
      `;
      return;
    }

    if (this.gardens.length === 0) {
      if (showEmpty) {
        this.innerHTML = `
          <section class="recent-gardens">
            <h2 class="recent-gardens-title">No Recent Activity</h2>
          </section>
        `;
      } else {
        this.innerHTML = '';
      }
      return;
    }

    const gardensHTML = this.gardens.map(garden => {
      const gardenUrl = garden.handle ? `/@${garden.handle}` : `/@${garden.did}`;
      const updateIcon = this.getUpdateTypeIcon(garden.updateType);
      // Only show time if we have a real timestamp (not epoch)
      const hasRealTimestamp = garden.lastUpdated.getTime() > 0;
      const relativeTime = hasRealTimestamp ? this.formatRelativeTime(garden.lastUpdated) : null;

      // Generate unique theme from DID
      const { theme } = generateThemeFromDid(garden.did);
      const { colors, borderStyle, borderWidth, shadow } = theme;

      const shadowValue = shadow.type === 'inset'
        ? `inset ${shadow.x} ${shadow.y} ${shadow.blur} ${shadow.spread} ${shadow.color}`
        : `${shadow.x} ${shadow.y} ${shadow.blur} ${shadow.spread} ${shadow.color}`;

      const rowStyle = `background: ${colors.background}; border: ${borderWidth} ${borderStyle} ${colors.border};`;
      const linkStyle = `color: ${colors.text};`;

      return `
        <article class="recent-garden-row" style="${rowStyle}" data-shadow="${this.escapeHtml(shadowValue)}">
          <a href="${gardenUrl}" class="recent-garden-row-link" style="${linkStyle}">
            <div class="recent-garden-flower">
              <did-visualization did="${garden.did}" size="40"></did-visualization>
            </div>
            <div class="recent-garden-identity">
              <span class="recent-garden-display-name" style="color: ${colors.text};">${this.escapeHtml(garden.title || garden.did)}</span>
              ${garden.subtitle ? `<span class="recent-garden-handle" style="color: ${colors.muted};">${this.escapeHtml(garden.subtitle)}</span>` : ''}
            </div>
            <div class="recent-garden-activity" style="color: ${colors.muted};">
              <span class="recent-garden-update-icon">${updateIcon}</span>
              ${relativeTime ? `<time class="recent-garden-time" datetime="${garden.lastUpdated.toISOString()}">${relativeTime}</time>` : ''}
            </div>
          </a>
        </article>
      `;
    }).join('');

    this.innerHTML = `
      <section class="recent-gardens">
        <h2 class="recent-gardens-title">Recent Garden Activity</h2>
        <div class="recent-gardens-list">
          ${gardensHTML}
        </div>
      </section>
    `;

    this.attachHoverHandlers();
  }

  /**
   * Attach hover handlers for shadow effects
   */
  private attachHoverHandlers() {
    const rows = this.querySelectorAll('.recent-garden-row');
    rows.forEach(row => {
      const el = row as HTMLElement;
      const shadow = el.dataset.shadow;

      el.addEventListener('mouseenter', () => {
        if (shadow) {
          el.style.boxShadow = shadow;
          el.style.transform = 'translateY(-2px)';
        }
      });

      el.addEventListener('mouseleave', () => {
        el.style.boxShadow = 'none';
        el.style.transform = 'none';
      });
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

customElements.define('recent-gardens', RecentGardens);

export type { GardenMetadata };
