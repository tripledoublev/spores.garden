import { listRecords, getBacklinks, getRecord } from '../at-client';
import { getCurrentDid, isLoggedIn, createRecord } from '../oauth';
import { getSiteOwnerDid } from '../config';

const SPECIAL_SPORE_COLLECTION = 'garden.spores.item.specialSpore';

/**
 * Find all spore records for a given origin garden using backlinks
 */
async function findAllSporeRecords(originGardenDid: string) {
  try {
    // Query backlinks to find all spore records that reference this origin garden
    const backlinksResponse = await getBacklinks(
      originGardenDid,
      `${SPECIAL_SPORE_COLLECTION}:subject`,
      { limit: 100 }
    );
    
    // Backlinks return records array with { did, collection, rkey }
    const backlinks = backlinksResponse.records || backlinksResponse.links || [];
    
    // Fetch full records for each backlink
    const recordPromises = backlinks.map(async (backlink) => {
      try {
        const record = await getRecord(
          backlink.did,
          backlink.collection || SPECIAL_SPORE_COLLECTION,
          backlink.rkey,
          { useSlingshot: true }
        );
        return record;
      } catch (error) {
        console.warn(`Failed to fetch spore record from ${backlink.did}:`, error);
        return null;
      }
    });
    
    const records = await Promise.all(recordPromises);
    const validRecords = records.filter(r => r !== null && r.value);
    
    // Sort by lastCapturedAt timestamp (most recent first)
    validRecords.sort((a, b) => {
      const timeA = new Date(a.value.lastCapturedAt || 0).getTime();
      const timeB = new Date(b.value.lastCapturedAt || 0).getTime();
      return timeB - timeA; // Descending order
    });
    
    return validRecords;
  } catch (error) {
    console.error('Failed to find spore records:', error);
    return [];
  }
}

export async function renderSpecialSporeDisplay(section) {
  const el = document.createElement('div');
  el.className = 'special-spore-display';

  const visitorDid = getCurrentDid();
  const ownerDid = getSiteOwnerDid();

  // Show content only if owner is set
  if (!ownerDid) {
    el.textContent = 'Garden owner not found.';
    return el;
  }

  try {
    // Use ownerDid as the originGardenDid (garden where spore originated)
    const allSporeRecords = await findAllSporeRecords(ownerDid);

    if (allSporeRecords.length === 0) {
      el.innerHTML = '<p>No special spore found in this garden.</p>';
      return el;
    }

    // Most recent record is the current holder
    const currentSporeRecord = allSporeRecords[0];
    const sporeOwnerDid = currentSporeRecord.value.ownerDid;
    
    const sporeEl = document.createElement('div');
    sporeEl.className = 'spore-item';

    const viz = document.createElement('did-visualization');
    viz.setAttribute('did', sporeOwnerDid); // The spore visualization is based on the owner's DID
    sporeEl.appendChild(viz);

    const text = document.createElement('p');
    text.textContent = `This special spore is currently owned by ${sporeOwnerDid}.`;
    sporeEl.appendChild(text);

    // "Steal this spore" button logic with restriction check
    if (isLoggedIn() && visitorDid && visitorDid !== sporeOwnerDid) {
      // Check if user has planted a flower or taken a seed (restriction)
      const hasPlantedFlower = await checkHasPlantedFlower(ownerDid, visitorDid);
      const hasTakenSeed = await checkHasTakenSeed(visitorDid, ownerDid);
      const canSteal = !hasPlantedFlower && !hasTakenSeed;

      if (canSteal) {
        const stealBtn = document.createElement('button');
        stealBtn.className = 'button button-primary';
        stealBtn.textContent = 'Steal this spore!';
        stealBtn.title = 'Steal this special spore (will also plant a flower as trade)';
        stealBtn.setAttribute('aria-label', 'Steal this special spore. This will also plant a flower in this garden as part of the trade.');
        stealBtn.addEventListener('click', async () => {
          if (confirm(`Are you sure you want to steal this special spore from ${sporeOwnerDid}? This will also plant a flower in this garden as part of the trade.`)) {
            try {
              await stealSpore(currentSporeRecord, visitorDid, ownerDid);
              // Re-render the section or page to reflect the change
              window.dispatchEvent(new CustomEvent('config-updated'));
            } catch (error) {
              console.error('Failed to steal spore:', error);
              alert(`Failed to steal spore: ${error.message}`);
            }
          }
        });
        sporeEl.appendChild(stealBtn);
        
        const helpText = document.createElement('p');
        helpText.className = 'spore-help-text';
        helpText.style.fontSize = '0.9em';
        helpText.style.opacity = '0.7';
        helpText.style.marginTop = '0.5em';
        helpText.textContent = 'You can only steal a spore if you haven\'t planted a flower or taken a seed from this garden yet.';
        sporeEl.appendChild(helpText);
      } else {
        const restrictionText = document.createElement('p');
        restrictionText.className = 'spore-restriction';
        restrictionText.style.opacity = '0.8';
        restrictionText.style.fontStyle = 'italic';
        if (hasPlantedFlower && hasTakenSeed) {
          restrictionText.textContent = 'You cannot steal this spore because you have already planted a flower and taken a seed from this garden.';
        } else if (hasPlantedFlower) {
          restrictionText.textContent = 'You cannot steal this spore because you have already planted a flower in this garden.';
        } else {
          restrictionText.textContent = 'You cannot steal this spore because you have already taken a seed from this garden.';
        }
        sporeEl.appendChild(restrictionText);
      }
    } else if (visitorDid === sporeOwnerDid) {
      const ownerText = document.createElement('p');
      ownerText.textContent = 'You currently own this special spore!';
      sporeEl.appendChild(ownerText);
    }
    
    el.appendChild(sporeEl);

    // Display chronological lineage
    if (allSporeRecords.length > 1) {
      const lineageEl = document.createElement('div');
      lineageEl.className = 'spore-lineage';
      lineageEl.style.marginTop = '2em';
      lineageEl.style.paddingTop = '1.5em';
      lineageEl.style.borderTop = '1px solid rgba(0,0,0,0.1)';

      const lineageTitle = document.createElement('h3');
      lineageTitle.textContent = 'Spore Lineage';
      lineageTitle.style.fontSize = '1.1em';
      lineageTitle.style.marginBottom = '1em';
      lineageEl.appendChild(lineageTitle);

      const lineageList = document.createElement('div');
      lineageList.className = 'lineage-list';

      // Display all records chronologically (oldest to newest, excluding current which is already shown)
      for (let i = allSporeRecords.length - 1; i >= 1; i--) {
        const record = allSporeRecords[i];
        const holderDid = record.value.ownerDid;
        const capturedAt = new Date(record.value.lastCapturedAt);

        const lineageItem = document.createElement('div');
        lineageItem.className = 'lineage-item';
        lineageItem.style.display = 'flex';
        lineageItem.style.alignItems = 'center';
        lineageItem.style.gap = '1em';
        lineageItem.style.marginBottom = '0.75em';
        lineageItem.style.padding = '0.5em';
        lineageItem.style.backgroundColor = 'rgba(0,0,0,0.02)';
        lineageItem.style.borderRadius = '4px';

        const holderViz = document.createElement('did-visualization');
        holderViz.setAttribute('did', holderDid);
        holderViz.style.width = '32px';
        holderViz.style.height = '32px';
        lineageItem.appendChild(holderViz);

        const holderInfo = document.createElement('div');
        holderInfo.style.flex = '1';

        const holderDidEl = document.createElement('div');
        holderDidEl.textContent = holderDid;
        holderDidEl.style.fontSize = '0.9em';
        holderInfo.appendChild(holderDidEl);

        const timestampEl = document.createElement('div');
        timestampEl.textContent = `Captured ${capturedAt.toLocaleDateString()} at ${capturedAt.toLocaleTimeString()}`;
        timestampEl.style.fontSize = '0.8em';
        timestampEl.style.opacity = '0.7';
        holderInfo.appendChild(timestampEl);

        lineageItem.appendChild(holderInfo);
        lineageList.appendChild(lineageItem);
      }

      lineageEl.appendChild(lineageList);
      el.appendChild(lineageEl);
    }

  } catch (error) {
    console.error('Failed to load special spore:', error);
    el.textContent = 'Failed to load special spore.';
  }

  return el;
}

/**
 * Check if current user has already planted a flower in the given garden
 */
async function checkHasPlantedFlower(ownerDid: string, currentDid: string | null): Promise<boolean> {
  if (!currentDid) return false;
  
  try {
    const response = await getBacklinks(ownerDid, 'garden.spores.social.flower:subject', { limit: 100 });
    const plantedFlowers = response.records || response.links || [];
    return plantedFlowers.some(flower => flower.did === currentDid);
  } catch (error) {
    console.error('Failed to check planted flowers:', error);
    return false;
  }
}

/**
 * Check if current user has already taken a seed from the given garden
 */
async function checkHasTakenSeed(currentDid: string | null, ownerDid: string): Promise<boolean> {
  if (!currentDid) return false;
  
  try {
    const response = await listRecords(currentDid, 'garden.spores.social.takenFlower', { limit: 100 });
    const takenFlowers = response.records || [];
    return takenFlowers.some(record => record.value?.sourceDid === ownerDid);
  } catch (error) {
    console.error('Failed to check taken seeds:', error);
    return false;
  }
}

async function stealSpore(sporeRecord: any, newOwnerDid: string, gardenOwnerDid: string) {
    const oldOwnerDid = sporeRecord.value.ownerDid;
    const originGardenDid = sporeRecord.value.originGardenDid || sporeRecord.value.subject;

    // Never delete old records - create new record only
    // 1. Create new spore record in new owner's PDS
    try {
        await createRecord('garden.spores.item.specialSpore', {
            $type: SPECIAL_SPORE_COLLECTION,
            subject: originGardenDid, // Preserve origin for backlink indexing
            ownerDid: newOwnerDid,
            originGardenDid: originGardenDid, // Preserve origin (never change)
            lastCapturedAt: new Date().toISOString(),
            history: [...(sporeRecord.value.history || []), { did: newOwnerDid, timestamp: new Date().toISOString() }]
        });
    } catch (error) {
        console.error('Failed to create spore for new owner:', error);
        throw new Error('Failed to create spore for new owner.');
    }

    // 2. Trade mechanic: Plant a flower in the garden as part of the trade
    try {
        await createRecord('garden.spores.social.flower', {
            subject: gardenOwnerDid,
            createdAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Failed to plant flower as trade:', error);
        // Don't throw here - spore steal was successful, flower planting is a bonus
        // Just log the error
    }
    
    alert(`You successfully stole the special spore from ${oldOwnerDid}! It is now yours. A flower has been planted in this garden as part of the trade.`);
}

