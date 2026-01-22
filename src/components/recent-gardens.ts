/**
 * <recent-gardens> - Displays recently updated gardens on the main page
 *
 * Shows a list of gardens that have been recently updated, either through:
 * - Manual edits to garden configuration
 * - Flower interactions (planting, taking seeds)
 * 
 * Uses Constellation backlinks to discover gardens with recent activity.
 */

import { getProfile, getBacklinks, getRecord } from '../at-client';
import type { BacklinkRecord } from '../types';
import { hasGardenIdentifierInUrl } from '../config';
import { generateThemeFromDid } from '../themes/engine';
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
  updateType?: 'edit' | 'flower-plant' | 'flower-take' | 'content';
  previewImage?: string;
}

/**
 * Cache structure for known gardens with versioning and timestamps
 */
interface KnownGardensCache {
  version: number;
  lastUpdated: number; // timestamp
  dids: string[];
}

// Cache version - increment when cache format changes
const CACHE_VERSION = 1;
// Cache TTL in milliseconds (1 hour)
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * API interface for fetching recent gardens
 */
interface RecentGardensAPI {
  getRecentGardens(limit: number, offset: number): Promise<GardenMetadata[]>;
}

/**
 * Mock API implementation for development and testing
 * Returns sample garden data with realistic timestamps
 */
class MockRecentGardensAPI implements RecentGardensAPI {
  private mockGardens: GardenMetadata[] = [
    {
      did: 'did:plc:example1',
      handle: 'alice.bsky.social',
      title: 'Alice\'s Garden',
      subtitle: '@alice.bsky.social',
      lastUpdated: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      updateType: 'flower-plant'
    },
    {
      did: 'did:plc:example2',
      handle: 'bob.bsky.social',
      title: 'Bob\'s Digital Garden',
      subtitle: '@bob.bsky.social',
      lastUpdated: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
      updateType: 'content'
    },
    {
      did: 'did:plc:example3',
      handle: 'charlie.bsky.social',
      title: 'Charlie\'s Spores',
      subtitle: '@charlie.bsky.social',
      lastUpdated: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      updateType: 'edit'
    },
    {
      did: 'did:plc:example4',
      handle: 'diana.bsky.social',
      title: 'Diana\'s Collection',
      subtitle: '@diana.bsky.social',
      lastUpdated: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      updateType: 'flower-take'
    },
    {
      did: 'did:plc:example5',
      handle: 'eve.bsky.social',
      title: 'Eve\'s Garden',
      subtitle: '@eve.bsky.social',
      lastUpdated: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      updateType: 'content'
    },
    {
      did: 'did:plc:example6',
      handle: 'frank.bsky.social',
      title: 'Frank\'s Spores',
      subtitle: '@frank.bsky.social',
      lastUpdated: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      updateType: 'flower-plant'
    }
  ];

  async getRecentGardens(limit: number = 12, offset: number = 0): Promise<GardenMetadata[]> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));

    // Return paginated results
    return this.mockGardens
      .slice(offset, offset + limit)
      .map(garden => ({ ...garden })); // Return copies
  }
}

/**
 * Constellation-based API implementation
 * Uses Constellation backlinks to discover gardens with recent activity
 */
class ConstellationRecentGardensAPI implements RecentGardensAPI {
  private knownGardenDids: string[] = [];

  /**
   * Fetch recent gardens using Constellation backlinks
   * Strategy: Query backlinks from known gardens to find recent activity
   */
  async getRecentGardens(limit: number = 12, offset: number = 0): Promise<GardenMetadata[]> {
    const gardens = new Map<string, GardenMetadata>();

    try {
      // Load known gardens from localStorage if available
      if (this.knownGardenDids.length === 0) {
        this.loadKnownGardens();
      }

      // Add current user's garden if logged in
      try {
        const { getCurrentDid } = await import('../oauth');
        const currentDid = getCurrentDid();
        if (currentDid && !this.knownGardenDids.includes(currentDid)) {
          this.knownGardenDids.push(currentDid);
        }
      } catch (error) {
        // Not logged in or import failed, continue
      }

      // Discover gardens from flower interactions
      const flowerBacklinks = await this.discoverGardensFromFlowers(limit * 2);

      // Discover gardens from config updates
      const configBacklinks = await this.discoverGardensFromConfigs(limit * 2);

      // Merge results
      for (const garden of [...flowerBacklinks, ...configBacklinks]) {
        const existing = gardens.get(garden.did);
        if (!existing || garden.lastUpdated > existing.lastUpdated) {
          gardens.set(garden.did, garden);
          // Add newly discovered gardens to known list
          if (!this.knownGardenDids.includes(garden.did)) {
            this.knownGardenDids.push(garden.did);
          }
        }
      }

      // Save updated known gardens list
      this.saveKnownGardens();

      // Sort by lastUpdated and paginate
      const sortedGardens = Array.from(gardens.values())
        .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime())
        .slice(offset, offset + limit);

      return sortedGardens;
    } catch (error) {
      console.error('Failed to fetch recent gardens from Constellation:', error);
      return [];
    }
  }

  /**
   * Discover gardens by finding recent flower plantings
   * Queries flower records to find gardens that have received flowers
   */
  private async discoverGardensFromFlowers(limit: number): Promise<GardenMetadata[]> {
    const gardens: GardenMetadata[] = [];
    const discoveredDids = new Set<string>();

    try {
      // Query flower records from known gardens to find who they've planted flowers for
      for (const gardenDid of this.knownGardenDids.slice(0, 10)) {
        try {
          // List flower records from this garden
          const { listRecords } = await import('../at-client');
          const flowerRecords = await listRecords(
            gardenDid,
            'garden.spores.social.flower',
            { limit: 20 },
            null
          );

          if (flowerRecords?.records) {
            for (const record of flowerRecords.records) {
              // The subject field in flower records points to the garden DID that received the flower
              const subjectDid = record.value?.subject;
              if (subjectDid && !discoveredDids.has(subjectDid) && subjectDid !== gardenDid) {
                discoveredDids.add(subjectDid);

                try {
                  // Check if this DID has a garden config
                  const configRecord = await getRecord(
                    subjectDid,
                    'garden.spores.site.config',
                    'self',
                    { useSlingshot: true }
                  );

                  if (configRecord?.value) {
                    const createdAt = record.value?.createdAt || record.value?.indexedAt;
                    gardens.push({
                      did: subjectDid,
                      lastUpdated: createdAt ? new Date(createdAt) : new Date(),
                      updateType: 'flower-plant'
                    });

                    // Limit discoveries
                    if (gardens.length >= limit) break;
                  }
                } catch (error) {
                  // Skip gardens we can't access
                  continue;
                }
              }
            }
          }
        } catch (error) {
          // Continue with next garden
          continue;
        }

        if (gardens.length >= limit) break;
      }
    } catch (error) {
      console.warn('Error discovering gardens from flowers:', error);
    }

    return gardens;
  }

  /**
   * Discover gardens by finding recent config updates
   * Checks known gardens for recent activity
   */
  private async discoverGardensFromConfigs(limit: number): Promise<GardenMetadata[]> {
    const gardens: GardenMetadata[] = [];

    // Check known gardens for recent config updates
    for (const gardenDid of this.knownGardenDids.slice(0, limit * 2)) {
      try {
        const configRecord = await getRecord(
          gardenDid,
          'garden.spores.site.config',
          'self',
          { useSlingshot: true }
        );

        if (configRecord?.value) {
          const updatedAt = configRecord.value.updatedAt || configRecord.value.createdAt;
          // Use the timestamp if available, otherwise use current time
          const updateDate = updatedAt ? new Date(updatedAt) : new Date();
          // Include all known gardens (not just recent ones) so newly created gardens show up
          gardens.push({
            did: gardenDid,
            lastUpdated: updateDate,
            updateType: 'edit'
          });
        }
      } catch (error) {
        // Garden doesn't exist or we can't access it, remove from known list
        const index = this.knownGardenDids.indexOf(gardenDid);
        if (index > -1) {
          this.knownGardenDids.splice(index, 1);
        }
        continue;
      }
    }

    return gardens;
  }

  /**
   * Load known gardens from localStorage with cache validation
   */
  private loadKnownGardens() {
    try {
      const stored = localStorage.getItem('spores.garden.knownGardens');
      if (stored) {
        const parsed = JSON.parse(stored);
        
        // Check if it's the new versioned format
        if (typeof parsed === 'object' && parsed.version !== undefined) {
          const cache = parsed as KnownGardensCache;
          
          // Validate cache version
          if (cache.version !== CACHE_VERSION) {
            console.log('Cache version mismatch, resetting known gardens cache');
            this.knownGardenDids = [];
            return;
          }
          
          // Check if cache is stale (older than TTL)
          const age = Date.now() - cache.lastUpdated;
          if (age > CACHE_TTL_MS) {
            console.log('Known gardens cache is stale, will refresh');
            // Still use the data but mark for refresh
            this.knownGardenDids = cache.dids || [];
          } else {
            this.knownGardenDids = cache.dids || [];
          }
        } else {
          // Legacy format (array of strings) - migrate to new format
          console.log('Migrating known gardens to versioned cache format');
          this.knownGardenDids = Array.isArray(parsed) ? parsed : [];
          this.saveKnownGardens(); // Save in new format
        }
      }
    } catch (error) {
      console.warn('Failed to load known gardens:', error);
      this.knownGardenDids = [];
    }
  }

  /**
   * Save known gardens to localStorage with versioning and timestamp
   */
  private saveKnownGardens() {
    try {
      const cache: KnownGardensCache = {
        version: CACHE_VERSION,
        lastUpdated: Date.now(),
        dids: this.knownGardenDids
      };
      localStorage.setItem('spores.garden.knownGardens', JSON.stringify(cache));
    } catch (error) {
      console.warn('Failed to save known gardens:', error);
    }
  }

  /**
   * Remove a garden DID from the known gardens list
   * Called when a garden is confirmed to no longer exist
   */
  private removeKnownGarden(did: string) {
    const index = this.knownGardenDids.indexOf(did);
    if (index > -1) {
      this.knownGardenDids.splice(index, 1);
      this.saveKnownGardens();
    }
  }

  /**
   * Add a garden DID to the known gardens list
   */
  addKnownGarden(did: string) {
    if (!this.knownGardenDids.includes(did)) {
      this.knownGardenDids.push(did);
      this.saveKnownGardens();
    }
  }

  /**
   * Check if cache needs refresh based on TTL
   */
  isCacheStale(): boolean {
    try {
      const stored = localStorage.getItem('spores.garden.knownGardens');
      if (!stored) return true;
      
      const parsed = JSON.parse(stored);
      if (typeof parsed === 'object' && parsed.version !== undefined) {
        const cache = parsed as KnownGardensCache;
        const age = Date.now() - cache.lastUpdated;
        return age > CACHE_TTL_MS;
      }
      return true; // Legacy format is considered stale
    } catch {
      return true;
    }
  }
}

/**
 * Register a garden DID as a known garden (for discovery)
 * Call this when a garden is created or updated
 */
export function registerGarden(did: string) {
  try {
    const stored = localStorage.getItem('spores.garden.knownGardens');
    let cache: KnownGardensCache;
    
    if (stored) {
      const parsed = JSON.parse(stored);
      // Handle both new and legacy formats
      if (typeof parsed === 'object' && parsed.version !== undefined) {
        cache = parsed as KnownGardensCache;
      } else {
        // Migrate from legacy format
        cache = {
          version: CACHE_VERSION,
          lastUpdated: Date.now(),
          dids: Array.isArray(parsed) ? parsed : []
        };
      }
    } else {
      cache = {
        version: CACHE_VERSION,
        lastUpdated: Date.now(),
        dids: []
      };
    }
    
    if (!cache.dids.includes(did)) {
      cache.dids.push(did);
      cache.lastUpdated = Date.now(); // Update timestamp when adding new garden
      localStorage.setItem('spores.garden.knownGardens', JSON.stringify(cache));
    }
  } catch (error) {
    console.warn('Failed to register garden:', error);
  }
}

class RecentGardens extends HTMLElement {
  private api: ConstellationRecentGardensAPI;
  private gardens: GardenMetadata[] = [];
  private loading = false;
  private visibilityHandler: (() => void) | null = null;
  private lastLoadTime = 0;

  constructor() {
    super();
    // Use Constellation API by default
    this.api = new ConstellationRecentGardensAPI();
  }

  static get observedAttributes() {
    return ['data-limit', 'data-show-empty', 'data-mock'];
  }

  connectedCallback() {
    this.loadGardens();
    
    // Set up visibility change listener to refresh stale data when tab becomes visible
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        // Only refresh if cache is stale or it's been more than 5 minutes since last load
        const timeSinceLastLoad = Date.now() - this.lastLoadTime;
        const shouldRefresh = this.api.isCacheStale() || timeSinceLastLoad > 5 * 60 * 1000;
        
        if (shouldRefresh && !this.loading) {
          console.log('Tab visible and cache stale, refreshing gardens...');
          this.loadGardens();
        }
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  disconnectedCallback() {
    // Clean up visibility listener
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
   * Check if we're on the main page (not viewing a specific garden)
   */
  private isMainPage(): boolean {
    return !hasGardenIdentifierInUrl();
  }

  /**
   * Load recent gardens from API
   */
  private async loadGardens() {
    // Only show on main page
    if (!this.isMainPage()) {
      this.style.display = 'none';
      return;
    }

    this.style.display = 'block';
    this.loading = true;
    this.render();

    try {
      // Seed some initial known gardens if none exist (for discovery bootstrapping)
      this.seedInitialGardens();

      const limit = parseInt(this.getAttribute('data-limit') || '12', 10);
      this.gardens = await this.api.getRecentGardens(limit);

      // Enrich garden data with profile information
      await this.enrichGardens();

      // Track last successful load time
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
   * Seed initial known gardens for discovery bootstrapping
   * These are well-known gardens that help bootstrap the discovery network
   */
  private seedInitialGardens() {
    try {
      const stored = localStorage.getItem('spores.garden.knownGardens');
      let cache: KnownGardensCache;
      
      if (stored) {
        const parsed = JSON.parse(stored);
        // Handle both new and legacy formats
        if (typeof parsed === 'object' && parsed.version !== undefined) {
          cache = parsed as KnownGardensCache;
        } else {
          // Migrate from legacy format
          cache = {
            version: CACHE_VERSION,
            lastUpdated: Date.now(),
            dids: Array.isArray(parsed) ? parsed : []
          };
        }
      } else {
        cache = {
          version: CACHE_VERSION,
          lastUpdated: Date.now(),
          dids: []
        };
      }

      // Seed gardens if list is empty or very small
      if (cache.dids.length < 3) {
        const seedGardens = [
          'did:plc:y3lae7hmqiwyq7w2v3bcb2c2', // charlebois.info
        ];

        let updated = false;
        for (const did of seedGardens) {
          if (!cache.dids.includes(did)) {
            cache.dids.push(did);
            updated = true;
          }
        }

        if (updated) {
          cache.lastUpdated = Date.now();
          localStorage.setItem('spores.garden.knownGardens', JSON.stringify(cache));
        }
      }
    } catch (error) {
      console.warn('Failed to seed initial gardens:', error);
    }
  }

  /**
   * Enrich garden metadata with profile information
   */
  private async enrichGardens() {
    for (const garden of this.gardens) {
      try {
        const profile = await getProfile(garden.did);
        garden.handle = profile.handle;
        garden.title = garden.title || profile.displayName || profile.handle;

        // If no subtitle is set, use handle
        if (!garden.subtitle && profile.handle) {
          garden.subtitle = `@${profile.handle}`;
        }
      } catch (error) {
        console.warn(`Failed to fetch profile for ${garden.did}:`, error);
        // Continue with DID if profile fetch fails
        garden.title = garden.title || garden.did;
      }
    }
  }

  /**
   * Format relative time (e.g., "2 hours ago")
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
   * Get update type icon/emoji
   */
  private getUpdateTypeIcon(updateType?: string): string {
    switch (updateType) {
      case 'flower-plant': return '🌸';
      case 'flower-take': return '🌼';
      case 'content': return '📝';
      case 'edit': return '✏️';
      default: return '✨';
    }
  }

  private render() {
    const showEmpty = this.getAttribute('data-show-empty') === 'true';

    if (this.loading) {
      this.innerHTML = `
        <section class="recent-gardens">
          <h2 class="recent-gardens-title">Loading Gardens</h2>
        </section>
      `;
      return;
    }

    if (this.gardens.length === 0) {
      if (showEmpty) {
        this.innerHTML = `
          <section class="recent-gardens">
            <h2 class="recent-gardens-title">No Recent Gardens Found</h2>
          </section>
        `;
      } else {
        this.innerHTML = '';
      }
      return;
    }

    const gardensHTML = this.gardens.map(garden => {
      const gardenUrl = garden.handle
        ? `/@${garden.handle}`
        : `/@${garden.did}`;

      const updateIcon = this.getUpdateTypeIcon(garden.updateType);
      const relativeTime = this.formatRelativeTime(garden.lastUpdated);

      // Generate unique theme styles from the garden's DID
      const { theme } = generateThemeFromDid(garden.did);
      const { colors, borderStyle, borderWidth, shadow } = theme;

      // Build inline styles for unique garden appearance
      const shadowValue = shadow.type === 'inset'
        ? `inset ${shadow.x} ${shadow.y} ${shadow.blur} ${shadow.spread} ${shadow.color}`
        : `${shadow.x} ${shadow.y} ${shadow.blur} ${shadow.spread} ${shadow.color}`;

      const rowStyle = `
        background: ${colors.background};
        border: ${borderWidth} ${borderStyle} ${colors.border};
      `.trim().replace(/\s+/g, ' ');

      const linkStyle = `
        color: ${colors.text};
      `.trim().replace(/\s+/g, ' ');

      const hoverShadow = shadowValue;

      return `
        <article class="recent-garden-row" style="${rowStyle}" data-shadow="${this.escapeHtml(hoverShadow)}">
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
              <time class="recent-garden-time" datetime="${garden.lastUpdated.toISOString()}">
                ${relativeTime}
              </time>
            </div>
          </a>
        </article>
      `;
    }).join('');

    this.innerHTML = `
      <section class="recent-gardens">
        <h2 class="recent-gardens-title">Recent Gardens</h2>
        <div class="recent-gardens-list">
          ${gardensHTML}
        </div>
      </section>
    `;

    // Attach hover handlers for unique shadow effects
    this.attachHoverHandlers();
  }

  /**
   * Attach hover handlers to garden rows for unique shadow effects
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

  /**
   * Set a custom API implementation (for testing or future integration)
   */
  setAPI(api: RecentGardensAPI) {
    this.api = api;
    this.loadGardens();
  }

  /**
   * Load known gardens from localStorage
   */
  private loadKnownGardensFromStorage(): string[] {
    try {
      const stored = localStorage.getItem('spores.garden.knownGardens');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Handle both new and legacy formats
        if (typeof parsed === 'object' && parsed.version !== undefined) {
          return (parsed as KnownGardensCache).dids || [];
        }
        // Legacy format
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (error) {
      console.warn('Failed to load known gardens from storage:', error);
    }
    return [];
  }

  /**
   * Save known gardens to localStorage with versioning
   */
  private saveKnownGardensToStorage(dids: string[]) {
    try {
      const cache: KnownGardensCache = {
        version: CACHE_VERSION,
        lastUpdated: Date.now(),
        dids
      };
      localStorage.setItem('spores.garden.knownGardens', JSON.stringify(cache));
    } catch (error) {
      console.warn('Failed to save known gardens to storage:', error);
    }
  }
}

customElements.define('recent-gardens', RecentGardens);

export type { RecentGardensAPI, GardenMetadata };
export { ConstellationRecentGardensAPI, MockRecentGardensAPI };
