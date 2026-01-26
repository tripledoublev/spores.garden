/**
 * Floating spore badge component.
 * Shows on the current spore holder's garden with steal UI.
 * This is rendered at the app level, not as a content section.
 */

import { getBacklinks, getRecord, getProfile } from '../at-client';
import { getCurrentDid, isLoggedIn, createRecord } from '../oauth';
import { getSiteOwnerDid, isValidSpore } from '../config';
import { generateSporeFlowerSVGString } from '../utils/flower-svg';
import { showConfirmModal, showAlertModal } from '../utils/confirm-modal';

const SPECIAL_SPORE_COLLECTION = 'garden.spores.item.specialSpore';

interface SporeInfo {
  originGardenDid: string;
  currentOwnerDid: string;
  currentRecord: any;
}

/**
 * Find all spores currently held by this garden owner
 */
async function findAllHeldSpores(gardenOwnerDid: string): Promise<SporeInfo[]> {
  const heldSpores: SporeInfo[] = [];
  
  try {
    // Check if this garden originated a spore and still holds it
    if (isValidSpore(gardenOwnerDid)) {
      const spore = await findSporeByOrigin(gardenOwnerDid);
      if (spore && spore.currentOwnerDid === gardenOwnerDid) {
        heldSpores.push(spore);
      }
    }

    // Check for any spore records this user owns
    const { listRecords } = await import('../at-client');
    const ownedSpores = await listRecords(gardenOwnerDid, SPECIAL_SPORE_COLLECTION, { limit: 10 });
    const sporeRecords = ownedSpores?.records || [];

    for (const record of sporeRecords) {
      const originDid = record.value?.subject;
      if (!originDid || !isValidSpore(originDid)) continue;
      
      // Skip if we already found this spore (from origin check above)
      if (heldSpores.some(s => s.originGardenDid === originDid)) continue;

      // Check if this user is the current holder
      const spore = await findSporeByOrigin(originDid);
      if (spore && spore.currentOwnerDid === gardenOwnerDid) {
        heldSpores.push(spore);
      }
    }

    return heldSpores;
  } catch (error) {
    console.error('Failed to find held spores:', error);
    return heldSpores;
  }
}

/**
 * Find spore info by its origin garden DID
 */
async function findSporeByOrigin(originGardenDid: string): Promise<SporeInfo | null> {
  try {
    const backlinksResponse = await getBacklinks(
      originGardenDid,
      `${SPECIAL_SPORE_COLLECTION}:subject`,
      { limit: 100 }
    );
    const backlinks = backlinksResponse.records || backlinksResponse.links || [];

    if (backlinks.length === 0) return null;

    // Fetch all records
    const records = await Promise.all(
      backlinks.map(async (bl) => {
        try {
          return await getRecord(bl.did, bl.collection || SPECIAL_SPORE_COLLECTION, bl.rkey, { useSlingshot: true });
        } catch {
          return null;
        }
      })
    );

    const validRecords = records.filter(r => r?.value);
    if (validRecords.length === 0) return null;

    // Sort by createdAt to find current holder
    validRecords.sort((a, b) => {
      const timeA = new Date(a.value.createdAt || 0).getTime();
      const timeB = new Date(b.value.createdAt || 0).getTime();
      return timeB - timeA;
    });

    const currentRecord = validRecords[0];
    // The owner is the DID that holds the most recent record (from backlink)
    const currentOwnerIndex = records.findIndex(r => r === currentRecord);
    const currentOwnerDid = backlinks[currentOwnerIndex]?.did;
    return {
      originGardenDid,
      currentOwnerDid,
      currentRecord
    };
  } catch (error) {
    console.error('Failed to find spore by origin:', error);
    return null;
  }
}

/**
 * Steal a spore - FFA capture-the-flag mechanic
 */
async function stealSpore(sporeInfo: SporeInfo, newOwnerDid: string, ownerHandle: string): Promise<void> {
  try {
    await createRecord('garden.spores.item.specialSpore', {
      $type: SPECIAL_SPORE_COLLECTION,
      subject: sporeInfo.originGardenDid,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to steal spore:', error);
    throw new Error('Failed to steal spore.');
  }

  await showAlertModal({
    title: 'Spore Stolen!',
    message: `You successfully stole the special spore from @${ownerHandle}! It is now yours. For now...`,
    buttonText: 'Nice!',
    type: 'success'
  });
}

class SporeBadge extends HTMLElement {
  private sporeInfos: SporeInfo[] = [];

  async connectedCallback() {
    await this.checkAndRender();

    // Listen for auth changes
    window.addEventListener('auth-change', () => this.checkAndRender());
  }

  async checkAndRender() {
    const ownerDid = getSiteOwnerDid();
    if (!ownerDid) {
      this.innerHTML = '';
      return;
    }

    this.sporeInfos = await findAllHeldSpores(ownerDid);

    if (this.sporeInfos.length === 0) {
      this.innerHTML = '';
      return;
    }

    await this.render();
  }

  async render() {
    if (this.sporeInfos.length === 0) {
      this.innerHTML = '';
      return;
    }

    const visitorDid = getCurrentDid();

    // Build badges HTML for each spore
    const badgesHtml = await Promise.all(
      this.sporeInfos.map(async (sporeInfo, index) => {
        const isOwner = visitorDid === sporeInfo.currentOwnerDid;
        const canSteal = isLoggedIn() && visitorDid && !isOwner;

        let ownerProfile;
        try {
          ownerProfile = await getProfile(sporeInfo.currentOwnerDid);
        } catch {
          ownerProfile = null;
        }
        const ownerHandle = ownerProfile?.handle || sporeInfo.currentOwnerDid.substring(0, 15) + '...';

        return `
          <div class="spore-badge" data-spore-index="${index}" style="bottom: ${20 + (index * 100)}px;">
            <div class="spore-badge-content">
              <div class="spore-badge-flower">
                ${generateSporeFlowerSVGString(sporeInfo.originGardenDid, 60)}
              </div>
              <div class="spore-badge-info">
                <span class="spore-badge-label">Special Spore</span>
                <span class="spore-badge-owner">${isOwner ? 'You are the current holder!' : `Held by @${ownerHandle}`}</span>
              </div>
              ${canSteal ? `
                <button class="spore-badge-steal button button-primary" data-spore-index="${index}">
                  Steal!
                </button>
              ` : ''}
            </div>
          </div>
        `;
      })
    );

    this.innerHTML = badgesHtml.join('');

    // Add steal handlers for each badge
    this.querySelectorAll('.spore-badge-steal').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const target = e.currentTarget as HTMLElement;
        const index = parseInt(target.dataset.sporeIndex || '0');
        const sporeInfo = this.sporeInfos[index];
        if (!visitorDid || !sporeInfo) return;

        let ownerProfile;
        try {
          ownerProfile = await getProfile(sporeInfo.currentOwnerDid);
        } catch {
          ownerProfile = null;
        }
        const ownerHandle = ownerProfile?.handle || sporeInfo.currentOwnerDid.substring(0, 15) + '...';

        const confirmed = await showConfirmModal({
          title: 'Steal this Spore?',
          message: `Are you sure you want to steal this special spore from @${ownerHandle}?`,
          confirmText: 'Steal it!',
          cancelText: 'Never mind',
        });

        if (confirmed) {
          try {
            await stealSpore(sporeInfo, visitorDid, ownerHandle);
            window.dispatchEvent(new CustomEvent('config-updated'));
          } catch (error) {
            await showAlertModal({
              title: 'Failed to Steal',
              message: error instanceof Error ? error.message : 'An unknown error occurred.',
              type: 'error'
            });
          }
        }
      });
    });

    // Add styles if not already present
    this.addStyles();
  }

  addStyles() {
    if (document.getElementById('spore-badge-styles')) return;

    const style = document.createElement('style');
    style.id = 'spore-badge-styles';
    style.textContent = `
      spore-badge {
        display: block;
      }

      .spore-badge {
        position: fixed;
        /* bottom is set inline per badge for stacking */
        right: 20px;
        background: var(--color-surface, #ffffff);
        border: 2px solid var(--color-border, #e5e7eb);
        border-radius: 12px;
        padding: 12px 16px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        animation: sporeBadgeSlideIn 0.3s ease-out;
      }

      @keyframes sporeBadgeSlideIn {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .spore-badge-content {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .spore-badge-flower {
        flex-shrink: 0;
        filter: drop-shadow(0 0 6px rgba(255, 215, 0, 0.4));
        animation: sporePulse 3s ease-in-out infinite;
      }

      @keyframes sporePulse {
        0%, 100% { filter: drop-shadow(0 0 6px rgba(255, 215, 0, 0.4)); }
        50% { filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.7)); }
      }

      .spore-badge-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-right: 10px;
      }

      .spore-badge-label {
        font-weight: 600;
        font-size: 0.9rem;
      }

      .spore-badge-owner {
        font-size: 0.8rem;
        color: var(--color-text-muted, #6b7280);
      }

      .spore-badge-steal {
        padding: 8px 16px;
        font-size: 0.85rem;
        font-weight: 600;
      }

      .spore-badge-captures {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--color-border, #e5e7eb);
        font-size: 0.75rem;
        color: var(--color-text-muted, #6b7280);
        text-align: center;
      }

      /* Mobile responsive */
      @media (max-width: 480px) {
        .spore-badge {
          bottom: 10px;
          right: 10px;
          left: 10px;
          padding: 10px 12px;
        }

        .spore-badge-flower svg {
          width: 48px;
          height: 48px;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

customElements.define('spore-badge', SporeBadge);

export { SporeBadge };
