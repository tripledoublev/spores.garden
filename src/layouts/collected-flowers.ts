import { listRecords } from '../at-client';
import { getCurrentDid } from '../oauth';
import { getSiteOwnerDid } from '../config';

export async function renderCollectedFlowers(section) {
  const el = document.createElement('div');
  el.className = 'collected-flowers';

  const visitorDid = getCurrentDid();
  const ownerDid = getSiteOwnerDid();

  // Always use the site owner's DID to list records, so visitors can see them
  try {
    const recordsOwnerDid = ownerDid || visitorDid;
    if (!recordsOwnerDid) {
      el.textContent = 'Could not determine garden owner.';
      return el;
    }

    const response = await listRecords(recordsOwnerDid, 'garden.spores.social.takenFlower', { limit: 100 });
    const takenFlowers = response.records;

    if (takenFlowers.length === 0) {
      el.innerHTML = '<p>Visit other gardens and take their seeds to start your collection. Each flower links back to its source garden.</p>';
      return el;
    }

    const grid = document.createElement('div');
    grid.className = 'flower-grid'; // Re-use flower-grid style

    for (const flowerRecord of takenFlowers) {
      const sourceDid = flowerRecord.value.sourceDid;
      const note = flowerRecord.value.note;

      const flowerEl = document.createElement('div');
      flowerEl.className = 'flower-grid-item';

      const link = document.createElement('a');
      link.href = `/@${sourceDid}`; // Link back to the source garden
      link.title = `View ${sourceDid}'s garden`;

      const viz = document.createElement('did-visualization');
      viz.setAttribute('did', sourceDid);
      link.appendChild(viz);

      flowerEl.appendChild(link);

      // Display note if present
      if (note) {
        const noteEl = document.createElement('div');
        noteEl.className = 'flower-note';
        noteEl.textContent = note;
        flowerEl.appendChild(noteEl);
      }

      grid.appendChild(flowerEl);
    }

    el.appendChild(grid);

  } catch (error) {
    console.error('Failed to load collected flowers:', error);
    el.textContent = 'Failed to load collected flowers.';
  }

  return el;
}
