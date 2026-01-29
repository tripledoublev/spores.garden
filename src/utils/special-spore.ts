/**
 * Special spore (capture-the-flag) logic: finding held spores and stealing.
 * Shared by header display (site-renderer) and steal UI (spore-modal).
 */

import { getBacklinks, getRecord, getProfile } from '../at-client';
import { getCurrentDid, isLoggedIn, createRecord } from '../oauth';
import { isValidSpore } from '../config';
import { showConfirmModal, showAlertModal } from './confirm-modal';

const SPECIAL_SPORE_COLLECTION = 'garden.spores.item.specialSpore';

export interface SporeInfo {
  originGardenDid: string;
  currentOwnerDid: string;
  currentRecord: any;
}

/**
 * Find spore info by its origin garden DID (current holder from latest record).
 */
export async function findSporeByOrigin(originGardenDid: string): Promise<SporeInfo | null> {
  try {
    const backlinksResponse = await getBacklinks(
      originGardenDid,
      `${SPECIAL_SPORE_COLLECTION}:subject`,
      { limit: 100 }
    );
    const backlinks = backlinksResponse.records || backlinksResponse.links || [];

    if (backlinks.length === 0) return null;

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

    validRecords.sort((a, b) => {
      const timeA = new Date(a.value.createdAt || 0).getTime();
      const timeB = new Date(b.value.createdAt || 0).getTime();
      return timeB - timeA;
    });

    const currentRecord = validRecords[0];
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
 * Find all spores currently held by this garden owner.
 */
export async function findAllHeldSpores(gardenOwnerDid: string): Promise<SporeInfo[]> {
  const heldSpores: SporeInfo[] = [];

  try {
    if (isValidSpore(gardenOwnerDid)) {
      const spore = await findSporeByOrigin(gardenOwnerDid);
      if (spore && spore.currentOwnerDid === gardenOwnerDid) {
        heldSpores.push(spore);
      }
    }

    const { listRecords } = await import('../at-client');
    const ownedSpores = await listRecords(gardenOwnerDid, SPECIAL_SPORE_COLLECTION, { limit: 10 });
    const sporeRecords = ownedSpores?.records || [];

    for (const record of sporeRecords) {
      const originDid = record.value?.subject;
      if (!originDid || !isValidSpore(originDid)) continue;
      if (heldSpores.some(s => s.originGardenDid === originDid)) continue;

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
 * Steal a spore (FFA capture-the-flag). Creates a new record for the new owner.
 */
export async function stealSpore(
  originGardenDid: string,
  newOwnerDid: string,
  previousOwnerHandle: string
): Promise<void> {
  try {
    await createRecord(SPECIAL_SPORE_COLLECTION, {
      $type: SPECIAL_SPORE_COLLECTION,
      subject: originGardenDid,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to steal spore:', error);
    throw new Error('Failed to steal spore.');
  }

  await showAlertModal({
    title: 'Spore Stolen!',
    message: `You successfully stole the special spore from @${previousOwnerHandle}! It is now yours. For now...`,
    buttonText: 'Nice!',
    type: 'success'
  });
}
