import { getBacklinks, getProfile, listRecords, getRecord } from '../at-client';
import { getSiteOwnerDid, isValidSpore, buildGardenPath } from '../config';
import { isLoggedIn, getCurrentDid } from '../oauth';
import { getSafeHandle, truncateDid } from '../utils/identity';
import { generateThemeFromDid } from '../themes/engine';
import { generateSporeFlowerSVGString, generateFlowerSVGString } from '../utils/flower-svg';
import { escapeHtml } from '../utils/sanitize';

const SPECIAL_SPORE_COLLECTION = 'garden.spores.item.specialSpore';

interface SporeRecord {
  ownerDid: string;
  capturedAt: string;
  subject: string;
  uri: string;
  rkey: string;
}

/**
 * Find all spore records for a given origin using backlinks
 * Returns records with ownerDid derived from backlink.did
 */


/**
 * Get the current holder of a spore by its origin DID
 */


export async function renderFlowerBed(section: any, headerStripMode: boolean = false): Promise<HTMLElement | null> {
  const ownerDid = getSiteOwnerDid();
  if (!ownerDid) {
    return null;
  }

  try {
    const response = await getBacklinks(ownerDid, 'garden.spores.social.flower:subject', { limit: 100 });
    // Constellation returns `records` (and some older code used `links`)
    const plantedFlowers = response.records || response.links || [];

    // Always show the owner's flower in their own garden, even if nobody else has planted here yet.
    // Backlinks only represent *other* people planting into this garden.
    let visitorFlowers = plantedFlowers
      .filter((f) => f?.did && typeof f.did === 'string')
      .filter((f) => f.did !== ownerDid);

    // Optimistically check if the current user has planted a flower (bypass indexer latency)
    if (isLoggedIn()) {
      const currentUserDid = getCurrentDid();
      if (currentUserDid && currentUserDid !== ownerDid) {
        // Check if we already see the user's flower in backlinks
        const alreadyListed = visitorFlowers.some(f => f.did === currentUserDid);

        if (!alreadyListed) {
          try {
            // Fetch user's flowers directly from their PDS
            const userFlowers = await listRecords(currentUserDid, 'garden.spores.social.flower', { limit: 50 });
            // Check if any flower points to this garden
            const hasPlanted = userFlowers?.records?.some(r => r.value?.subject === ownerDid);

            if (hasPlanted) {
              // Manually add their flower to the list
              visitorFlowers.push({ did: currentUserDid });
            }
          } catch (e) {
            console.warn('Failed to check user flowers:', e);
          }
        }
      }
    }

    // Create element and apply classes
    const el = document.createElement('div');
    el.className = 'flower-bed';
    if (headerStripMode) {
      el.classList.add('header-strip');
    }

    // Always include the owner's flower first, then visitors
    const raw = [{ did: ownerDid, isOwner: true }, ...visitorFlowers];
    const seen = new Set<string>();
    const flowersToRender = raw.filter((f) => {
      if (seen.has(f.did)) return false;
      seen.add(f.did);
      return true;
    });

    const grid = document.createElement('div');
    grid.className = 'flower-grid';

    // Render flowers with async handle resolution
    const flowerPromises = flowersToRender.map(async (flower: any) => {
      const flowerEl = document.createElement('div');
      flowerEl.className = 'flower-grid-item';
      if (flower.isOwner) {
        flowerEl.classList.add('flower-grid-item--owner');
      }

      const container = document.createElement('div');
      container.style.position = 'relative';
      container.style.cursor = 'pointer';

      const viz = document.createElement('did-visualization');
      viz.setAttribute('did', flower.did);
      container.appendChild(viz);

      // Add click handler to show all gardens where this flower was planted
      container.addEventListener('click', async (e) => {
        e.preventDefault();
        await showFlowerGardensModal(flower.did);
      });

      flowerEl.appendChild(container);
      return flowerEl;
    });

    const flowerElements = await Promise.all(flowerPromises);
    for (const flowerEl of flowerElements) {
      grid.appendChild(flowerEl);
    }

    // === SPORE RENDERING ===


    el.appendChild(grid);

    return el;

  } catch (error) {
    console.error('Failed to load flower bed:', error);
    return null;
  }
}

/**
 * Find spores that should appear in this garden's flower bed.
 * 
 * A spore appears if:
 * 1. It originated from this garden
 * 2. This garden owner has ever captured it (has a record for it)
 * 
 * Deduplication: Group by origin (subject), show one per origin
 * Badge: isCurrentHolder indicates if garden owner currently holds it
 */


/**
 * Render spores in the flower bed as special outline flowers
 */


/**
 * Show modal with spore details and full lineage trail
 * Lineage is reconstructed from all backlinked records (not stored in record)
 */


/**
 * Find all gardens where a specific DID has planted flowers
 */
async function findGardensWithFlower(flowerDid: string): Promise<Array<{ gardenDid: string; profile: any }>> {
  try {
    // List all flower records created by this DID
    const response = await listRecords(flowerDid, 'garden.spores.social.flower', { limit: 100 });
    const flowerRecords = response.records || [];

    // Extract unique garden DIDs from the subject field
    const gardenDids = new Set<string>();
    for (const record of flowerRecords) {
      if (record.value?.subject) {
        gardenDids.add(record.value.subject);
      }
    }

    // Fetch profiles for each garden
    const gardenPromises = Array.from(gardenDids).map(async (gardenDid) => {
      try {
        const profile = await getProfile(gardenDid);
        return { gardenDid, profile };
      } catch (error) {
        // If profile fetch fails, still include the garden with null profile
        return { gardenDid, profile: null };
      }
    });

    return await Promise.all(gardenPromises);
  } catch (error) {
    console.error('Failed to find gardens with flower:', error);
    return [];
  }
}

/**
 * Create a clickable link element for a garden
 * Uses the garden DID to generate its unique theme colors (like recent-gardens)
 */
function createGardenLink(
  gardenDid: string,
  gardenHandle: string,
  displayName: string,
  profile: any
): HTMLAnchorElement {
  const { theme } = generateThemeFromDid(gardenDid);
  const { colors, borderStyle, borderWidth } = theme;

  const visitLink = document.createElement('a');
  visitLink.href = buildGardenPath(profile?.handle || gardenDid);
  visitLink.className = 'button flower-garden-cta';
  visitLink.style.display = 'flex';
  visitLink.style.alignItems = 'center';
  visitLink.style.gap = '0.75rem';
  visitLink.style.width = '100%';
  visitLink.style.boxSizing = 'border-box';
  visitLink.style.marginBottom = '0.5rem';
  visitLink.style.padding = '0.75rem 1rem';
  visitLink.style.textDecoration = 'none';
  visitLink.style.background = colors.background;
  visitLink.style.color = colors.text;
  visitLink.style.border = `${borderWidth} ${borderStyle} ${colors.border}`;
  const labelName = displayName || gardenHandle;
  visitLink.setAttribute('aria-label', `Go to ${labelName}'s garden`);
  visitLink.title = `Go to ${labelName}'s garden`;

  const vizWrap = document.createElement('div');
  vizWrap.style.width = '40px';
  vizWrap.style.height = '40px';
  vizWrap.style.flexShrink = '0';

  const viz = document.createElement('did-visualization');
  viz.setAttribute('did', gardenDid);
  viz.setAttribute('size', '40');
  vizWrap.appendChild(viz);
  visitLink.appendChild(vizWrap);

  const textWrap = document.createElement('div');
  textWrap.style.display = 'flex';
  textWrap.style.flexDirection = 'column';
  textWrap.style.alignItems = 'flex-start';
  textWrap.style.gap = '0.125rem';
  textWrap.style.minWidth = '0';
  textWrap.style.flex = '1';
  textWrap.style.overflow = 'hidden';

  const primary = document.createElement('div');
  primary.style.fontWeight = '700';
  primary.style.fontSize = '0.875rem';
  primary.style.letterSpacing = '0.02em';
  primary.style.color = colors.text;
  primary.textContent = labelName;
  textWrap.appendChild(primary);

  const secondary = document.createElement('div');
  secondary.style.fontWeight = '400';
  secondary.style.fontSize = '0.75rem';
  secondary.style.overflow = 'hidden';
  secondary.style.textOverflow = 'ellipsis';
  secondary.style.whiteSpace = 'nowrap';
  secondary.style.maxWidth = '100%';
  secondary.style.color = colors.muted;
  secondary.textContent = gardenHandle;
  textWrap.appendChild(secondary);

  visitLink.appendChild(textWrap);
  return visitLink;
}

/**
 * Show a modal displaying all gardens where a specific flower was planted
 */
async function showFlowerGardensModal(flowerDid: string) {
  // Get current page DID to detect if links point to current page
  const currentPageDid = getSiteOwnerDid();

  // Get flower profile for display
  let flowerProfile;
  try {
    flowerProfile = await getProfile(flowerDid);
  } catch (error) {
    flowerProfile = null;
  }

  const safeHandle = getSafeHandle(flowerProfile?.handle, flowerDid);
  const flowerHandle = safeHandle === flowerDid ? truncateDid(flowerDid) : safeHandle;
  const flowerDisplayName = flowerProfile?.displayName || flowerHandle;
  const isFlowerGardenCurrentPage = currentPageDid && flowerDid === currentPageDid;

  // Create modal
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 480px;">
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem;">
        <h2 style="margin: 0; line-height: 1.3;">
          This flower is originally from <span style="white-space: nowrap;">${escapeHtml(flowerDisplayName)}</span>'s garden
        </h2>
        <button class="button button-ghost modal-close" aria-label="Close" style="font-size: 1.5rem; line-height: 1; padding: 0; width: 2rem; height: 2rem; flex-shrink: 0;">×</button>
      </div>
      <div id="flower-gardens-self-cta" style="margin: 0 0 1rem 0;"></div>
      <p style="margin: 0 0 1rem 0; color: var(--color-text-muted, #6b7280);">
        Visit other gardens where this flower grows
      </p>
      <div id="flower-gardens-list" style="min-height: 100px;">
        <h2 style="margin: 0; line-height: 1.3;">Loading gardens...</h2>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Add "Visit flower owner's garden" button when not on current page
  const selfCta = modal.querySelector('#flower-gardens-self-cta');
  if (selfCta && !isFlowerGardenCurrentPage) {
    const visitSelfLink = createGardenLink(
      flowerDid,
      `@${flowerHandle}`,
      flowerProfile?.displayName || flowerHandle,
      flowerProfile
    );
    selfCta.appendChild(visitSelfLink);
  } else if (selfCta && isFlowerGardenCurrentPage) {
    selfCta.remove();
  }

  // Close handlers
  const closeBtn = modal.querySelector('.modal-close');
  closeBtn?.addEventListener('click', () => modal.remove());

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  // Load gardens
  const gardensList = modal.querySelector('#flower-gardens-list');
  try {
    const gardens = await findGardensWithFlower(flowerDid);

    if (gardens.length === 0) {
      if (gardensList) gardensList.innerHTML = '<h2>This flower hasn\'t been planted in any other garden yet</h2>';
      return;
    }

    if (gardensList) gardensList.innerHTML = '';

    // Create list of gardens (skip current page)
    for (const { gardenDid, profile } of gardens) {
      if (currentPageDid && gardenDid === currentPageDid) continue;

      if (currentPageDid && gardenDid === currentPageDid) continue;

      const safeGardenHandle = getSafeHandle(profile?.handle, gardenDid);
      const displayGardenHandle = safeGardenHandle === gardenDid ? truncateDid(gardenDid) : safeGardenHandle;
      const gardenHandle = `@${displayGardenHandle}`;
      const visitLink = createGardenLink(
        gardenDid,
        gardenHandle,
        profile?.displayName || gardenHandle,
        profile
      );
      gardensList?.appendChild(visitLink);
    }

    if (gardensList?.children.length === 0) {
      gardensList.innerHTML = '<h2>This flower hasn\'t been planted in any other garden yet</h2>';
    }
  } catch (error) {
    console.error('Failed to load gardens:', error);
    if (gardensList) gardensList.innerHTML = '<p>Failed to load gardens. Please try again.</p>';
  }
}
