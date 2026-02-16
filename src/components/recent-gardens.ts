/**
 * <recent-gardens> - Displays recent garden activity on the main page
 *
 * Shows gardens with recent flower activity, discovered through:
 * - Jetstream: Real-time events from across the AT Protocol network
 * - Constellation backlinks: Historical flower interactions
 */

import { getProfile, getRecord, listReposByCollection } from '../at-client';
import { hasGardenIdentifierInUrl, buildGardenPath } from '../config';
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


/** How long before cached data is considered stale */
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Cached activity for a garden (persists across page loads)
 */
interface CachedActivity {
  updateType: GardenMetadata['updateType'];
  timestamp: number; // ms since epoch — when the activity happened
  checkedAt: number; // ms since epoch — when we last fetched/verified this
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
export function setCachedActivity(did: string, updateType: GardenMetadata['updateType'], timestamp: Date) {
  try {
    const stored = localStorage.getItem('spores.garden.activityCache');
    const cache: Record<string, CachedActivity> = stored ? JSON.parse(stored) : {};

    cache[did] = {
      updateType: updateType || 'flower',
      timestamp: timestamp.getTime(),
      checkedAt: Date.now(),
    };

    // Keep cache size reasonable (max 500 entries)
    const entries = Object.entries(cache);
    if (entries.length > 500) {
      // Remove oldest entries by checkedAt
      entries.sort((a, b) => (a[1].checkedAt || 0) - (b[1].checkedAt || 0));
      const newCache: Record<string, CachedActivity> = {};
      entries.slice(-500).forEach(([k, v]) => newCache[k] = v);
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
   * Load recent gardens by discovering all gardens via relay,
   * then checking activity to find the most recent ones.
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
      // Step 1: Discover all garden DIDs — use cached list if fresh, otherwise fetch from relay
      let allGardenDids: string[];
      const didListFetchedAt = parseInt(localStorage.getItem('spores.garden.didListFetchedAt') || '0', 10);
      const didListFresh = (Date.now() - didListFetchedAt) < CACHE_TTL;

      if (didListFresh) {
        allGardenDids = loadKnownGardens();
        console.log('[RecentGardens] Using cached DID list:', allGardenDids.length, 'gardens');
      } else {
        try {
          allGardenDids = await listReposByCollection('garden.spores.site.config');
          console.log('[RecentGardens] Discovered gardens from relay:', allGardenDids.length);
          saveKnownGardens(allGardenDids);
          localStorage.setItem('spores.garden.didListFetchedAt', Date.now().toString());
        } catch (error) {
          console.warn('[RecentGardens] Failed to fetch from relay, using cached gardens:', error);
          allGardenDids = loadKnownGardens();
        }
      }
      this.knownGardenDids = allGardenDids;

      // Add current user if logged in
      try {
        const { getCurrentDid } = await import('../oauth');
        const currentDid = getCurrentDid();
        if (currentDid && !allGardenDids.includes(currentDid)) {
          allGardenDids.push(currentDid);
          this.knownGardenDids = allGardenDids;
          saveKnownGardens(this.knownGardenDids);
        }
      } catch {
        // Not logged in
      }

      // Step 2: Check activity for ALL DIDs and find the most recent
      const limit = parseInt(this.getAttribute('data-limit') || '12', 10);
      const discovered = await this.checkAllGardenActivity(allGardenDids, limit);
      console.log('[RecentGardens] Top gardens by activity:', discovered.length);

      // Merge with any gardens already found via Jetstream (don't overwrite newer)
      for (const garden of discovered) {
        const existingIndex = this.gardens.findIndex(g => g.did === garden.did);
        if (existingIndex >= 0) {
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
   * Check activity for all garden DIDs and return the most recent ones.
   * DIDs are already verified as having garden.spores.site.config (from relay).
   * Fetches flower/takenFlower/spore records in parallel for each DID.
   */
  private async checkAllGardenActivity(gardenDids: string[], limit: number): Promise<GardenMetadata[]> {
    try {
      const { listRecords } = await import('../at-client');

      // Partition DIDs: use cache for fresh entries, fetch for stale/missing
      const results: GardenMetadata[] = [];
      const staleDids: string[] = [];

      for (const did of gardenDids) {
        const cached = getCachedActivity(did);
        if (cached && cached.checkedAt && (Date.now() - cached.checkedAt) < CACHE_TTL) {
          results.push({ did, lastUpdated: new Date(cached.timestamp), updateType: cached.updateType });
        } else {
          staleDids.push(did);
        }
      }

      console.log('[RecentGardens] Activity cache: %d fresh, %d stale/new', results.length, staleDids.length);

      // Fetch activity for stale/new DIDs in batches of 20
      const BATCH_SIZE = 20;

      for (let i = 0; i < staleDids.length; i += BATCH_SIZE) {
        const batch = staleDids.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (did) => {
            const cached = getCachedActivity(did);

            try {
              // Fetch most recent activity record of each type in parallel
              const [flowers, takenFlowers, spores] = await Promise.all([
                listRecords(did, 'garden.spores.social.flower', { limit: 1 }, null).catch(() => null),
                listRecords(did, 'garden.spores.social.takenFlower', { limit: 1 }, null).catch(() => null),
                listRecords(did, 'garden.spores.item.specialSpore', { limit: 1 }, null).catch(() => null),
              ]);

              const activities: Array<{ timestamp: Date; type: GardenMetadata['updateType'] }> = [];

              if (flowers?.records?.[0]?.value?.createdAt) {
                activities.push({ timestamp: new Date(flowers.records[0].value.createdAt), type: 'flower' });
              }
              if (takenFlowers?.records?.[0]?.value?.createdAt) {
                activities.push({ timestamp: new Date(takenFlowers.records[0].value.createdAt), type: 'seedling' });
              }
              if (spores?.records?.[0]?.value?.createdAt) {
                activities.push({ timestamp: new Date(spores.records[0].value.createdAt), type: 'spore' });
              }
              if (cached) {
                activities.push({ timestamp: new Date(cached.timestamp), type: cached.updateType });
              }

              if (activities.length > 0) {
                activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
                const best = activities[0];
                setCachedActivity(did, best.type, best.timestamp);
                return { did, lastUpdated: best.timestamp, updateType: best.type } as GardenMetadata;
              }

              // No activity found — still mark as checked so we don't re-fetch
              setCachedActivity(did, 'edit', new Date(0));
              return { did, lastUpdated: new Date(0), updateType: 'edit' as const } as GardenMetadata;
            } catch {
              // On fetch failure, fall back to cached activity
              if (cached) {
                return { did, lastUpdated: new Date(cached.timestamp), updateType: cached.updateType } as GardenMetadata;
              }
              return { did, lastUpdated: new Date(0), updateType: 'edit' as const } as GardenMetadata;
            }
          })
        );
        results.push(...batchResults);
      }

      // Sort by activity (real activity first, then by timestamp)
      results.sort((a, b) => {
        const aHasActivity = a.lastUpdated.getTime() > 0;
        const bHasActivity = b.lastUpdated.getTime() > 0;
        if (aHasActivity && !bHasActivity) return -1;
        if (!aHasActivity && bHasActivity) return 1;
        return b.lastUpdated.getTime() - a.lastUpdated.getTime();
      });

      console.log('[RecentGardens] Checked activity for', results.length, 'gardens');
      return results.slice(0, limit);
    } catch (error) {
      console.warn('Error checking garden activity:', error);
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
          <h2 class="recent-gardens-title">Loading activity...</h2>
        </section>
      `;
      return;
    }

    if (this.gardens.length === 0) {
      if (showEmpty) {
        this.innerHTML = `
          <section class="recent-gardens">
            <h2 class="recent-gardens-title">No recent activity</h2>
          </section>
        `;
      } else {
        this.innerHTML = '';
      }
      return;
    }

    const gardensHTML = this.gardens.map(garden => {
      const gardenUrl = buildGardenPath(garden.handle || garden.did);
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
        <h2 class="recent-gardens-title">Recent garden activity</h2>
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
