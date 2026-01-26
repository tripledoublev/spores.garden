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
async function findSporeRecordsByOrigin(originGardenDid: string): Promise<SporeRecord[]> {
  try {
    const backlinksResponse = await getBacklinks(
      originGardenDid,
      `${SPECIAL_SPORE_COLLECTION}:subject`,
      { limit: 100 }
    );
    const backlinks = backlinksResponse.records || backlinksResponse.links || [];

    const records = await Promise.all(
      backlinks.map(async (bl) => {
        try {
          const record = await getRecord(
            bl.did,
            bl.collection || SPECIAL_SPORE_COLLECTION,
            bl.rkey,
            { useSlingshot: true }
          );
          if (!record?.value) return null;
          return {
            ownerDid: bl.did,
            capturedAt: record.value.createdAt,
            subject: record.value.subject,
            uri: record.uri || `at://${bl.did}/${bl.collection || SPECIAL_SPORE_COLLECTION}/${bl.rkey}`,
            rkey: bl.rkey
          } as SporeRecord;
        } catch {
          return null;
        }
      })
    );

    return records.filter((r): r is SporeRecord => r !== null);
  } catch (error) {
    console.error('Failed to find spore records by origin:', error);
    return [];
  }
}

/**
 * Get the current holder of a spore by its origin DID
 */
async function getCurrentHolder(originGardenDid: string): Promise<string | null> {
  const records = await findSporeRecordsByOrigin(originGardenDid);
  if (records.length === 0) return null;

  // Sort by capturedAt DESC, most recent = current holder
  records.sort((a, b) => {
    const timeA = new Date(a.capturedAt || 0).getTime();
    const timeB = new Date(b.capturedAt || 0).getTime();
    return timeB - timeA;
  });

  return records[0].ownerDid;
}

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
    // Check if this garden has any spores to display (originated here OR owner captured one)
    await renderSporesInFlowerBed(ownerDid, grid);

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
async function findSporesForGarden(gardenOwnerDid: string): Promise<Array<{
  originGardenDid: string;
  currentHolderDid: string;
  isOrigin: boolean;
  isCurrentHolder: boolean;
}>> {
  const spores: Array<{
    originGardenDid: string;
    currentHolderDid: string;
    isOrigin: boolean;
    isCurrentHolder: boolean;
  }> = [];

  const seenOrigins = new Set<string>();

  try {
    // 1. Check if this garden originated a spore (always show if valid)
    if (isValidSpore(gardenOwnerDid)) {
      const currentHolder = await getCurrentHolder(gardenOwnerDid);
      seenOrigins.add(gardenOwnerDid);
      spores.push({
        originGardenDid: gardenOwnerDid,
        currentHolderDid: currentHolder || gardenOwnerDid,
        isOrigin: true,
        isCurrentHolder: currentHolder === gardenOwnerDid
      });
    }

    // 2. Check all spores this garden owner has ever captured
    try {
      const ownedRecords = await listRecords(gardenOwnerDid, SPECIAL_SPORE_COLLECTION, { limit: 50 });
      const records = ownedRecords?.records || [];

      // Group by unique origin (subject) - dedupe
      const byOrigin = new Map<string, { capturedAt: string; record: any }>();
      for (const record of records) {
        const originDid = record.value?.subject;
        if (!originDid) continue;
        
        const capturedAt = record.value?.createdAt || '';
        const existing = byOrigin.get(originDid);
        
        if (!existing || capturedAt > existing.capturedAt) {
          byOrigin.set(originDid, { capturedAt, record });
        }
      }

      // For each unique origin, add to spores list
      for (const [originDid] of byOrigin) {
        // Skip if already processed (e.g., own origin)
        if (seenOrigins.has(originDid)) continue;
        seenOrigins.add(originDid);

        // Validate the spore
        if (!isValidSpore(originDid)) continue;

        // Check who is current holder
        const currentHolder = await getCurrentHolder(originDid);
        spores.push({
          originGardenDid: originDid,
          currentHolderDid: currentHolder || originDid,
          isOrigin: false,
          isCurrentHolder: currentHolder === gardenOwnerDid
        });
      }
    } catch (e) {
      console.warn('Failed to check owned spores:', e);
    }

  } catch (error) {
    console.error('Failed to find spores for garden:', error);
  }

  return spores;
}

/**
 * Render spores in the flower bed as special outline flowers
 */
async function renderSporesInFlowerBed(ownerDid: string, grid: HTMLElement): Promise<void> {
  const spores = await findSporesForGarden(ownerDid);

  for (const spore of spores) {
    const sporeEl = document.createElement('div');
    sporeEl.className = 'flower-grid-item spore-item';

    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.cursor = 'pointer';

    // Generate outline flower SVG for the spore (based on ORIGIN garden's DID)
    const sporeSvg = generateSporeFlowerSVGString(spore.originGardenDid, 100);
    container.innerHTML = sporeSvg;

    // Add click handler to show spore details modal
    container.addEventListener('click', async (e) => {
      e.preventDefault();
      await showSporeDetailsModal(spore.originGardenDid);
    });

    sporeEl.appendChild(container);
    grid.appendChild(sporeEl);
  }
}

/**
 * Show modal with spore details and full lineage trail
 * Lineage is reconstructed from all backlinked records (not stored in record)
 */
async function showSporeDetailsModal(originGardenDid: string) {
  // Fetch all records for this origin to build lineage
  const allRecords = await findSporeRecordsByOrigin(originGardenDid);
  
  // Sort by capturedAt ascending (oldest first for lineage display)
  allRecords.sort((a, b) => {
    const timeA = new Date(a.capturedAt || 0).getTime();
    const timeB = new Date(b.capturedAt || 0).getTime();
    return timeA - timeB;
  });

  // Current holder is the most recent
  const currentHolderDid = allRecords.length > 0 
    ? allRecords[allRecords.length - 1].ownerDid 
    : originGardenDid;

  // Build lineage from ALL records (every capture event, including re-steals)
  const lineage: Array<{did: string; timestamp?: string; isOrigin?: boolean; isCurrent?: boolean}> = [];

  for (let i = 0; i < allRecords.length; i++) {
    const record = allRecords[i];
    const isFirst = i === 0;
    const isLast = i === allRecords.length - 1;

    lineage.push({
      did: record.ownerDid,
      timestamp: record.capturedAt,
      isOrigin: isFirst,  // First chronological record = origin
      isCurrent: isLast   // Last chronological record = current holder
    });
  }

  // If origin has no record yet (never stolen, validated by isValidSpore),
  // ensure origin appears first
  if (lineage.length === 0 || lineage[0].did !== originGardenDid) {
    lineage.unshift({
      did: originGardenDid,
      isOrigin: true,
      isCurrent: currentHolderDid === originGardenDid
    });
  }

  // Fetch all profiles in parallel
  const uniqueDids = [...new Set(lineage.map(l => l.did))];
  const profileMap = new Map<string, any>();
  try {
    const profiles = await Promise.all(uniqueDids.map(did => getProfile(did).catch(() => null)));
    uniqueDids.forEach((did, i) => {
      if (profiles[i]) profileMap.set(did, profiles[i]);
    });
  } catch {
    // Profiles are optional
  }

  const getHandle = (did: string) => {
    const profile = profileMap.get(did);
    return profile?.handle || did.substring(0, 20) + '...';
  };

  const getLink = (did: string) => {
    const profile = profileMap.get(did);
    return `/@${profile?.handle || did}`;
  };

  const formatDate = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Build lineage HTML
  const lineageHtml = lineage.map((entry, index) => {
    const handle = getHandle(entry.did);
    const link = getLink(entry.did);
    const isFirst = index === 0;
    
    let label = '';
    if (entry.isOrigin && entry.isCurrent) label = '🌱 Origin · Current Holder';
    else if (entry.isOrigin) label = '🌱 Origin';
    else if (entry.isCurrent) label = '✨ Current Holder';
    else label = '🌿 Visited';
    
    return `
      <div style="display: flex; align-items: flex-start; gap: 0.75rem; position: relative;">
        <!-- Connector line -->
        ${!isFirst ? `<div style="position: absolute; left: 15px; top: -12px; width: 2px; height: 12px; background: var(--color-border, #e0e0e0);"></div>` : ''}
        
        <!-- Flower icon -->
        <div style="width: 32px; height: 32px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          ${generateFlowerSVGString(entry.did, 32)}
        </div>
        
        <!-- Info -->
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap;">
            <a href="${link}" style="font-weight: ${entry.isCurrent ? '600' : '400'}; color: var(--color-text); text-decoration: none; overflow: hidden; text-overflow: ellipsis;">
              @${handle}
            </a>
            <span style="font-size: 0.75rem; color: var(--color-text-muted);">${label}</span>
          </div>
          ${entry.timestamp ? `<div style="font-size: 0.75rem; color: var(--color-text-muted);">${formatDate(entry.timestamp)}</div>` : ''}
        </div>
      </div>
    `;
  }).join(`<div style="height: 12px;"></div>`);

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 480px;">
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem;">
        <h2 style="margin: 0; font-size: 1.25rem; line-height: 1.3;">
          Special Spore
        </h2>
        <button class="button button-ghost modal-close" aria-label="Close" style="font-size: 1.5rem; line-height: 1; padding: 0; width: 2rem; height: 2rem; flex-shrink: 0;">×</button>
      </div>
      
      <div style="text-align: center; margin-bottom: 1.5rem;">
        ${generateSporeFlowerSVGString(originGardenDid, 100)}
      </div>
      
      <p style="font-size: 0.9em; color: var(--color-text-muted); margin-bottom: 1.5rem; text-align: center;">
        This rare spore travels from garden to garden. Follow its journey!
      </p>
      
      <!-- Lineage Trail -->
      <div style="margin-bottom: 1.5rem; padding: var(--spacing-md);">
        <h3 style="font-size: 0.9rem; font-weight: 600; margin: 0 0 1rem 0; color: var(--color-text-muted);">
          Journey (${lineage.length} garden${lineage.length !== 1 ? 's' : ''})
        </h3>
        <div style="display: flex; flex-direction: column; gap: 0;">
          ${lineageHtml}
        </div>
      </div>
      
      <div style="display: flex; gap: 0.5rem; padding: var(--spacing-md);">
        <a href="${getLink(originGardenDid)}" class="button button-secondary" style="flex: 1; display: flex; justify-content: center; align-items: center; text-decoration: none;">
          Visit Origin
        </a>
        <a href="${getLink(currentHolderDid)}" class="button button-primary" style="flex: 1; display: flex; justify-content: center; align-items: center; text-align: center; text-decoration: none;">
          Visit Current Holder
        </a>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close handlers
  const closeBtn = modal.querySelector('.modal-close');
  closeBtn?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

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
