/**
 * Special spore (capture-the-flag) logic: finding held spores and stealing.
 * Shared by header display (site-renderer) and steal UI (spore-modal).
 */

import { getBacklinks, getRecord } from '../at-client';
import { createRecord } from '../oauth';
import { isValidSpore } from '../config';
import { showAlertModal } from './confirm-modal';

const SPECIAL_SPORE_COLLECTION = 'garden.spores.item.specialSpore';
const MAX_CAPTURE_FUTURE_SKEW_MS = 5 * 60 * 1000;
const SPORE_STEAL_COOLDOWN_MS = 1 * 60 * 1000;

export interface SporeInfo {
  originGardenDid: string;
  currentOwnerDid: string;
  currentRecord: any;
}

function parseCaptureTimestampMs(createdAt: unknown, nowMs = Date.now()): number | null {
  if (typeof createdAt !== 'string' || !createdAt) {
    return null;
  }

  const parsedMs = new Date(createdAt).getTime();
  if (!Number.isFinite(parsedMs)) {
    return null;
  }

  // Ignore records with implausible future timestamps.
  if (parsedMs > nowMs + MAX_CAPTURE_FUTURE_SKEW_MS) {
    return null;
  }

  return parsedMs;
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

    const validRecords = records.filter((r) => {
      if (!r?.value) return false;
      return parseCaptureTimestampMs(r.value.createdAt) !== null;
    });
    if (validRecords.length === 0) return null;

    validRecords.sort((a, b) => {
      const timeA = parseCaptureTimestampMs(a.value.createdAt) || 0;
      const timeB = parseCaptureTimestampMs(b.value.createdAt) || 0;
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
  const currentHolder = await findSporeByOrigin(originGardenDid);
  if (!currentHolder) {
    throw new Error('Could not find a valid spore record to steal.');
  }

  if (currentHolder.currentOwnerDid === newOwnerDid) {
    throw new Error('You already hold this spore.');
  }

  const latestCaptureMs = parseCaptureTimestampMs(currentHolder.currentRecord?.value?.createdAt);
  if (latestCaptureMs === null) {
    throw new Error('Spore capture timestamp is invalid. Try again in a few minutes.');
  }

  const nowMs = Date.now();
  const elapsedMs = Math.max(0, nowMs - latestCaptureMs);
  if (elapsedMs < SPORE_STEAL_COOLDOWN_MS) {
    const remainingMs = SPORE_STEAL_COOLDOWN_MS - elapsedMs;
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    throw new Error(`This spore was just captured. Try again in about ${remainingMinutes} minute(s).`);
  }

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
