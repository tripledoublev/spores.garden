import { getBacklinks, getProfile, listRecords, getRecord } from '../at-client';
import { getSiteOwnerDid, isValidSpore } from '../config';
import { generateThemeFromDid } from '../themes/engine';
import { isLoggedIn, getCurrentDid } from '../oauth';
import { generateSporeFlowerSVGString, generateFlowerSVGString } from '../utils/flower-svg';

const SPECIAL_SPORE_COLLECTION = 'garden.spores.item.specialSpore';

interface SporeRecord {
  ownerDid: string;
  capturedAt: string;
  subject: string;
  uri: string;
  rkey: string;
}

/**
 * Get owner's theme generated deterministically from their DID
 */
function getOwnerTheme(ownerDid: string) {
  const generated = generateThemeFromDid(ownerDid);
  return generated.theme;
}

/**
 * Find all spore records for a given origin using backlinks
 * Returns records with ownerDid derived from backlink.did
 */


/**
 * Get the current holder of a spore by its origin DID
 */


export async function renderFlowerBed(section) {
  const el = document.createElement('div');
  el.className = 'flower-bed';

  const ownerDid = getSiteOwnerDid();
  if (!ownerDid) {
    el.textContent = 'Could not determine garden owner.';
    return el;
  }

  // Get owner's unique theme (generated from DID)
  const ownerTheme = getOwnerTheme(ownerDid);

  // Get theme colors, border style, and border width
  const colors = ownerTheme?.colors;
  const borderStyle = ownerTheme?.borderStyle || 'solid';
  const borderWidth = ownerTheme?.borderWidth || '4px';

  // Use accent or primary color for the inset border to show uniqueness
  const insetBorderColor = colors?.accent || colors?.primary || colors?.border || colors?.text || '#000000';
  const borderColor = colors?.text || colors?.border || '#000000';
  // Use background color, but lighten it slightly for surface effect
  const backgroundColor = colors?.background || '#f8f9fa';

  // Apply owner's unique styling to the flower bed via CSS custom properties
  el.style.setProperty('--flower-bed-border-style', borderStyle);
  el.style.setProperty('--flower-bed-border-width', borderWidth);
  el.style.setProperty('--flower-bed-border-color', borderColor);
  el.style.setProperty('--flower-bed-inset-color', insetBorderColor);
  el.style.setProperty('--flower-bed-background', backgroundColor);

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

    const flowersToRender = [{ did: ownerDid }, ...visitorFlowers];

    const grid = document.createElement('div');
    grid.className = 'flower-grid';

    // Render flowers with async handle resolution
    const flowerPromises = flowersToRender.map(async (flower) => {
      const flowerEl = document.createElement('div');
      flowerEl.className = 'flower-grid-item';

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

    // Add a friendly hint if nobody else has planted here yet.
    // Hide this hint if the user is logged in and viewing their own garden.
    const isViewingOwnGarden = isLoggedIn() && getCurrentDid() === ownerDid;
    if (visitorFlowers.length === 0 && !isViewingOwnGarden) {
      const hint = document.createElement('p');
      hint.style.marginTop = '1rem';
      hint.style.color = 'var(--color-text-muted, #6b7280)';
      hint.textContent = 'Be the first to plant a flower here! Your unique flower will appear in this garden.';
      el.appendChild(hint);
    }

  } catch (error) {
    console.error('Failed to load flower bed:', error);
    el.textContent = error instanceof Error ? error.message : 'Failed to load flower bed.';
  }

  return el;
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
 * Show a modal displaying all gardens where a specific flower was planted
 */
async function showFlowerGardensModal(flowerDid: string) {
  // Get flower profile for display
  let flowerProfile;
  try {
    flowerProfile = await getProfile(flowerDid);
  } catch (error) {
    flowerProfile = null;
  }

  const flowerHandle = flowerProfile?.handle || flowerDid.substring(0, 20) + '...';

  // Create modal
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 480px;">
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem;">
        <h2 style="margin: 0; font-size: 1.25rem; line-height: 1.3;">
          This flower is originally from <span style="white-space: nowrap;">@${flowerHandle}</span>'s garden
        </h2>
        <button class="button button-ghost modal-close" aria-label="Close" style="font-size: 1.5rem; line-height: 1; padding: 0; width: 2rem; height: 2rem; flex-shrink: 0;">×</button>
      </div>
      <div id="flower-gardens-self-cta" style="margin: 0 0 1rem 0;"></div>
      <p style="margin: 0 0 1rem 0; color: var(--color-text-muted, #6b7280);">
        Visit other gardens where this flower grows
      </p>
      <div id="flower-gardens-list" style="min-height: 100px;">
        <p>Loading gardens...</p>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Add "Visit @flower garden" button directly under the heading
  const selfCta = modal.querySelector('#flower-gardens-self-cta');
  if (selfCta) {
    const visitSelfLink = document.createElement('a');
    visitSelfLink.href = `/@${flowerProfile?.handle || flowerDid}`;
    visitSelfLink.className = 'button button-primary';
    visitSelfLink.style.display = 'flex';
    visitSelfLink.style.alignItems = 'center';
    visitSelfLink.style.gap = '0.75rem';
    visitSelfLink.style.width = '100%';
    visitSelfLink.style.boxSizing = 'border-box';
    visitSelfLink.style.padding = '0.75rem 1rem';
    visitSelfLink.style.textDecoration = 'none';
    visitSelfLink.setAttribute('aria-label', `Visit @${flowerHandle}'s garden`);
    visitSelfLink.title = `Visit @${flowerHandle}'s garden`;

    const vizWrap = document.createElement('div');
    vizWrap.style.width = '40px';
    vizWrap.style.height = '40px';
    vizWrap.style.flexShrink = '0';

    const viz = document.createElement('did-visualization');
    viz.setAttribute('did', flowerDid);
    viz.setAttribute('size', '40');
    vizWrap.appendChild(viz);
    visitSelfLink.appendChild(vizWrap);

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
    primary.style.textTransform = 'uppercase';
    primary.style.letterSpacing = '0.02em';
    primary.textContent = `Visit @${flowerHandle}'s garden`;
    textWrap.appendChild(primary);

    const secondary = document.createElement('div');
    secondary.style.fontWeight = '400';
    secondary.style.opacity = '0.85';
    secondary.style.fontSize = '0.875rem';
    secondary.style.overflow = 'hidden';
    secondary.style.textOverflow = 'ellipsis';
    secondary.style.whiteSpace = 'nowrap';
    secondary.style.maxWidth = '100%';
    secondary.textContent = flowerProfile?.displayName || flowerHandle;
    textWrap.appendChild(secondary);

    visitSelfLink.appendChild(textWrap);
    selfCta.appendChild(visitSelfLink);
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
      if (gardensList) gardensList.innerHTML = '<p>This flower hasn\'t been planted in any other garden yet.</p>';
      return;
    }

    if (gardensList) gardensList.innerHTML = '';

    // Create list of gardens
    for (const { gardenDid, profile } of gardens) {
      const gardenHandle = profile?.handle ? `@${profile.handle}` : `${gardenDid.substring(0, 20)}...`;

      // Single, full-width CTA per garden (prevents layout overlap on narrow modals)
      const visitLink = document.createElement('a');
      visitLink.href = `/@${profile?.handle || gardenDid}`;
      visitLink.className = 'button button-primary';
      visitLink.style.display = 'flex';
      visitLink.style.alignItems = 'center';
      visitLink.style.gap = '0.75rem';
      visitLink.style.width = '100%';
      visitLink.style.boxSizing = 'border-box';
      visitLink.style.marginBottom = '0.5rem';
      visitLink.style.padding = '0.75rem 1rem';
      visitLink.style.textDecoration = 'none';
      visitLink.setAttribute('aria-label', `Visit ${gardenHandle}'s garden`);
      visitLink.title = `Visit ${gardenHandle}'s garden`;

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
      primary.style.textTransform = 'uppercase';
      primary.style.letterSpacing = '0.02em';
      primary.textContent = `Visit ${gardenHandle}'s garden`;
      textWrap.appendChild(primary);

      const secondary = document.createElement('div');
      secondary.style.fontWeight = '400';
      secondary.style.opacity = '0.85';
      secondary.style.fontSize = '0.875rem';
      secondary.style.overflow = 'hidden';
      secondary.style.textOverflow = 'ellipsis';
      secondary.style.whiteSpace = 'nowrap';
      secondary.style.maxWidth = '100%';
      secondary.textContent = profile?.displayName || gardenHandle;
      textWrap.appendChild(secondary);

      visitLink.appendChild(textWrap);

      gardensList?.appendChild(visitLink);
    }
  } catch (error) {
    console.error('Failed to load gardens:', error);
    if (gardensList) gardensList.innerHTML = '<p>Failed to load gardens. Please try again.</p>';
  }
}
