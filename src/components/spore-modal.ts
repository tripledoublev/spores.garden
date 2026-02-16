import { getBacklinks, getProfile, getRecord } from '../at-client';
import { getCurrentDid, isLoggedIn } from '../oauth';
import { buildGardenPath } from '../config';
import { getSafeHandle, truncateDid } from '../utils/identity';
import { generateFlowerSVGString, generateSporeFlowerSVGString } from '../utils/flower-svg';
import { stealSpore } from '../utils/special-spore';
import { showConfirmModal, showAlertModal } from '../utils/confirm-modal';
import { escapeHtml } from '../utils/sanitize';

const SPECIAL_SPORE_COLLECTION = 'garden.spores.item.specialSpore';

interface SporeRecord {
  ownerDid: string;
  capturedAt: string;
  subject: string;
  uri: string;
  rkey: string;
}

function removeHeaderSpore(originDid: string): void {
  const sporeEl = document.querySelector(`.header-spores [data-origin-did="${originDid}"]`) as HTMLElement | null;
  if (!sporeEl) return;

  const wrap = sporeEl.parentElement as HTMLElement | null;
  sporeEl.remove();
  if (wrap && wrap.childElementCount === 0) {
    wrap.remove();
  }
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
 * Build lineage and HTML from spore records (shared by open and load)
 */
function buildLineageContent(
  originGardenDid: string,
  allRecords: SporeRecord[],
  profileMap: Map<string, any>
): string {
  allRecords.sort((a, b) => {
    const timeA = new Date(a.capturedAt || 0).getTime();
    const timeB = new Date(b.capturedAt || 0).getTime();
    return timeA - timeB;
  });

  const currentHolderDid = allRecords.length > 0
    ? allRecords[allRecords.length - 1].ownerDid
    : originGardenDid;

  const lineage: Array<{ did: string; timestamp?: string; isOrigin?: boolean; isCurrent?: boolean }> = [];

  for (let i = 0; i < allRecords.length; i++) {
    const record = allRecords[i];
    const isFirst = i === 0;
    const isLast = i === allRecords.length - 1;
    lineage.push({
      did: record.ownerDid,
      timestamp: record.capturedAt,
      isOrigin: isFirst,
      isCurrent: isLast
    });
  }

  if (lineage.length === 0 || lineage[0].did !== originGardenDid) {
    lineage.unshift({
      did: originGardenDid,
      isOrigin: true,
      isCurrent: currentHolderDid === originGardenDid
    });
  }

  const getHandle = (did: string) => {
    const profile = profileMap.get(did);
    const safe = getSafeHandle(profile?.handle, did);
    return safe === did ? truncateDid(did) : safe;
  };

  const getLink = (did: string) => {
    const profile = profileMap.get(did);
    return buildGardenPath(getSafeHandle(profile?.handle, did));
  };

  const formatDate = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return lineage.map((entry, index) => {
    const handle = getHandle(entry.did);
    const link = getLink(entry.did);
    const isFirst = index === 0;
    return `
      <div style="display: flex; align-items: flex-start; gap: 0.75rem; position: relative;">
        ${!isFirst ? `<div style="position: absolute; left: 15px; top: -12px; width: 2px; height: 12px; background: var(--color-border, #e0e0e0);"></div>` : ''}
        <div style="width: 32px; height: 32px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          ${generateFlowerSVGString(entry.did, 32)}
        </div>
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
}

/**
 * Show modal with spore details and full lineage trail.
 * Modal opens immediately with a loading state; lineage loads in the background.
 */
export async function showSporeDetailsModal(originGardenDid: string) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  const contentSlot = 'data-spore-lineage-slot';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 480px;">
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem;">
        <h2 style="margin: 0; line-height: 1.3;">
          This rare spore travels from garden to garden. Follow its journey!
        </h2>
        <button class="button button-ghost modal-close" aria-label="Close" style="font-size: 1.5rem; line-height: 1; padding: 0; width: 2rem; height: 2rem; flex-shrink: 0;">×</button>
      </div>
      <div style="text-align: center; margin-bottom: 1.5rem;">
        ${generateSporeFlowerSVGString(originGardenDid, 100)}
      </div>
      <div style="margin-bottom: 1.5rem; padding: var(--spacing-md);" ${contentSlot}>
        <div style="display: flex; flex-direction: column; gap: 0; align-items: center; justify-content: center; min-height: 60px; color: var(--color-text-muted); font-size: 0.875rem;">
          Loading lineage…
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector('.modal-close');
  closeBtn?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  // Load lineage in background and replace slot; then add holder/steal section below
  const slot = modal.querySelector(`[${contentSlot}]`);
  try {
    const allRecords = await findSporeRecordsByOrigin(originGardenDid);
    const uniqueDids = [...new Set(
      allRecords.map(r => r.ownerDid).concat(originGardenDid)
    )];
    const profileMap = new Map<string, any>();
    const profiles = await Promise.all(uniqueDids.map(did => getProfile(did).catch(() => null)));
    uniqueDids.forEach((did, i) => {
      if (profiles[i]) profileMap.set(did, profiles[i]);
    });
    const lineageHtml = buildLineageContent(originGardenDid, allRecords, profileMap);

    const currentHolderDid = allRecords.length > 0
      ? allRecords[allRecords.length - 1].ownerDid
      : originGardenDid;
    const visitorDid = getCurrentDid();
    const isOwner = visitorDid === currentHolderDid;
    const canSteal = isLoggedIn() && !!visitorDid && !isOwner;
    const currentHolderProfile = profileMap.get(currentHolderDid);
    const safeOwnerHandle = getSafeHandle(currentHolderProfile?.handle, currentHolderDid);
    const ownerHandle = safeOwnerHandle === currentHolderDid ? truncateDid(currentHolderDid) : safeOwnerHandle;

    const holderHtml = canSteal ? `
      <div class="spore-modal-holder" style="margin-top: 1.25rem; padding-top: 1.25rem;">
        <button type="button" class="button button-primary spore-modal-steal" data-origin-did="${originGardenDid}" data-owner-handle="${escapeHtml(ownerHandle)}">
          Capture the spore!
        </button>
      </div>
    ` : '';

    if (slot) {
      slot.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0;">
          ${lineageHtml}
        </div>
        ${holderHtml}
      `;

      const stealBtn = slot.querySelector('.spore-modal-steal');
      if (stealBtn && visitorDid) {
        stealBtn.addEventListener('click', async () => {
          const originDid = (stealBtn as HTMLElement).dataset.originDid;
          const prevHandle = (stealBtn as HTMLElement).dataset.ownerHandle;
          if (!originDid || !prevHandle) return;

          const confirmed = await showConfirmModal({
            title: 'Steal this Spore?',
            message: `Are you sure you want to steal this special spore from @${prevHandle}?`,
            confirmText: 'Steal it!',
            cancelText: 'Never mind',
          });

          if (confirmed) {
            try {
              await stealSpore(originDid, visitorDid, prevHandle);
              removeHeaderSpore(originDid);
              modal.remove();
            } catch (error) {
              await showAlertModal({
                title: 'Failed to Steal',
                message: error instanceof Error ? error.message : 'An unknown error occurred.',
                type: 'error'
              });
            }
          }
        });
      }
    }
  } catch (err) {
    if (slot) {
      slot.innerHTML = `
        <div style="color: var(--color-text-muted); font-size: 0.875rem;">
          Could not load lineage. Try again later.
        </div>
      `;
    }
  }
}
