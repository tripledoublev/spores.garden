import { getBacklinks, getProfile, getRecord } from '../at-client';
import { generateFlowerSVGString, generateSporeFlowerSVGString } from '../utils/flower-svg';
import { isValidSpore } from '../config';

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
 * Show modal with spore details and full lineage trail
 * Lineage is reconstructed from all backlinked records (not stored in record)
 */
export async function showSporeDetailsModal(originGardenDid: string) {
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
  const lineage: Array<{ did: string; timestamp?: string; isOrigin?: boolean; isCurrent?: boolean }> = [];

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
    return `/@${profile?.handle || did}`
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
          This rare spore travels from garden to garden. Follow its journey!
        </h2>
        <button class="button button-ghost modal-close" aria-label="Close" style="font-size: 1.5rem; line-height: 1; padding: 0; width: 2rem; height: 2rem; flex-shrink: 0;">×</button>
      </div>
      
      <div style="text-align: center; margin-bottom: 1.5rem;">
        ${generateSporeFlowerSVGString(originGardenDid, 100)}
      </div>
      

      
      <!-- Lineage Trail -->
      <div style="margin-bottom: 1.5rem; padding: var(--spacing-md);">

        <div style="display: flex; flex-direction: column; gap: 0;">
          ${lineageHtml}
        </div>
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
