import { getBacklinks, getProfile, listRecords } from '../at-client';
import { getSiteOwnerDid, buildGardenPath } from '../config';
import { isLoggedIn, getCurrentDid } from '../oauth';
import { getBacklinkQueries, getReadCollections } from '../config/nsid';
import { getSafeHandle, truncateDid } from '../utils/identity';
import { generateThemeFromDid } from '../themes/engine';
import { escapeHtml } from '../utils/sanitize';

/**
 * Find all spore records for a given origin using backlinks
 * Returns records with ownerDid derived from backlink.did
 */


/**
 * Get the current holder of a spore by its origin DID
 */


export async function renderFlowerBed(_section: any, headerStripMode: boolean = false): Promise<HTMLElement | null> {
  const ownerDid = getSiteOwnerDid();
  if (!ownerDid) {
    return null;
  }

  try {
    const backlinkQueries = getBacklinkQueries('socialFlower', 'subject');
    const backlinkResponses = await Promise.all(backlinkQueries.map((q) => getBacklinks(ownerDid, q, { limit: 100 }).catch(() => null)));
    // Constellation returns `records` (and some older code used `links`)
    const plantedFlowers = backlinkResponses.flatMap((response: any) => response?.records || response?.links || []);

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
            let hasPlanted = false;
            for (const socialFlowerCollection of getReadCollections('socialFlower')) {
              const userFlowers = await listRecords(currentUserDid, socialFlowerCollection, { limit: 50 }).catch(() => null);
              hasPlanted = !!userFlowers?.records?.some(r => r.value?.subject === ownerDid);
              if (hasPlanted) break;
            }

            if (hasPlanted) visitorFlowers.push({ did: currentUserDid });
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
      const flowerEl = document.createElement('button');
      flowerEl.type = 'button';
      flowerEl.className = 'flower-grid-item';
      if (flower.isOwner) {
        flowerEl.classList.add('flower-grid-item--owner');
      }

      const viz = document.createElement('did-visualization');
      viz.setAttribute('did', flower.did);
      flowerEl.appendChild(viz);

      flowerEl.addEventListener('click', async () => {
        await showFlowerGardensModal(flower.did);
      });

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
    const allFlowerRecords = await Promise.all(
      getReadCollections('socialFlower').map((collection) =>
        listRecords(flowerDid, collection, { limit: 100 }).catch(() => ({ records: [] }))
      )
    );
    const flowerRecords = allFlowerRecords.flatMap((response: any) => response.records || []);

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
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="flower-modal-title" style="max-width: 480px;">
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem;">
        <h2 id="flower-modal-title" style="margin: 0; line-height: 1.3;">
          ${isFlowerGardenCurrentPage
            ? `This is <span style="white-space: nowrap;">${escapeHtml(flowerDisplayName)}</span>'s unique flower.`
            : `This flower is originally from <span style="white-space: nowrap;">${escapeHtml(flowerDisplayName)}</span>'s garden`
          }
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

  const closeModal = () => {
    document.removeEventListener('keydown', handleKeydown);
    modal.remove();
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeModal();
  };

  document.body.appendChild(modal);
  modal.querySelector<HTMLButtonElement>('.modal-close')?.focus();
  document.addEventListener('keydown', handleKeydown);

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
  modal.querySelector('.modal-close')?.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
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
