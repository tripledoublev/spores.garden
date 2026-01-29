import { listRecords, getRecord, getProfile } from '../at-client';
import { getCurrentDid, isLoggedIn, deleteRecord, putRecord } from '../oauth';
import { getSiteOwnerDid } from '../config';
import { showConfirmModal } from '../utils/confirm-modal';

/** Pen (edit) icon – 24×24 viewBox, stroke. */
const PEN_ICON_SVG =
  '<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/><path d="m15 5 4 4"/></svg>';

/** X (close/delete) icon – 24×24 viewBox, stroke. */
const X_ICON_SVG =
  '<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

export interface RenderCollectedFlowersOptions {
  onRefresh?: () => void;
  editMode?: boolean;
}

export async function renderCollectedFlowers(
  section: any,
  options?: RenderCollectedFlowersOptions
) {
  const el = document.createElement('div');
  el.className = 'collected-flowers';

  const visitorDid = getCurrentDid();
  const ownerDid = getSiteOwnerDid();
  const canManageFlowers =
    isLoggedIn() && !!visitorDid && !!ownerDid && visitorDid === ownerDid;

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
      el.innerHTML = '<p>Visit other gardens and pick flowers to start your collection. Each flower links back to its source garden.</p>';
      return el;
    }

    const grid = document.createElement('div');
    grid.className = 'flower-grid'; // Re-use flower-grid style

    for (const flowerRecord of takenFlowers) {
      const sourceDid = flowerRecord.value.sourceDid;
      const createdAt = flowerRecord.value.createdAt;
      const note = flowerRecord.value.note;
      const rkey = flowerRecord.uri?.split('/').pop();

      const flowerEl = document.createElement('div');
      flowerEl.className = 'flower-grid-item';

      const link = document.createElement('a');
      link.href = `/@${sourceDid}`; // Link back to the source garden
      link.title = `View ${sourceDid}'s garden`;

      // Async fetch of display name and handle
      (async () => {
        try {
          let displayName = sourceDid;

          // Fetch profiles
          let bskyProfile = null;
          try {
            bskyProfile = await getProfile(sourceDid);
          } catch (e) { /* ignore */ }

          let gardenProfile = null;
          try {
            gardenProfile = await getRecord(sourceDid, 'garden.spores.site.profile', 'self');
          } catch (e) { /* ignore */ }

          // Update URL if handle is available
          if (bskyProfile?.handle) {
            link.href = `/@${bskyProfile.handle}`;
          }

          // Resolve display name: Garden Profile -> Bluesky Display Name -> Bluesky Handle
          if (gardenProfile?.value?.displayName) {
            displayName = gardenProfile.value.displayName;
          } else if (bskyProfile?.displayName) {
            displayName = bskyProfile.displayName;
          } else if (bskyProfile?.handle) {
            displayName = bskyProfile.handle;
          }

          if (displayName !== sourceDid) {
            link.title = `View ${displayName}'s garden`;
          }
        } catch (e) {
          console.warn('Failed to resolve metadata for collected flower', e);
        }
      })();

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

      // Edit and Remove (owner only) – icon buttons
      if (canManageFlowers && rkey) {
        const actions = document.createElement('div');
        actions.className = 'flower-grid-item-actions';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'button button-icon button-secondary flower-grid-item-action-btn';
        editBtn.setAttribute('aria-label', 'Edit note');
        editBtn.title = 'Edit note';
        editBtn.innerHTML = PEN_ICON_SVG;
        editBtn.addEventListener('click', () => {
          openEditNoteModal(note ?? '', (newNote) => {
            putRecord('garden.spores.social.takenFlower', rkey, {
              sourceDid,
              createdAt,
              note: newNote,
            })
              .then(() => {
                options?.onRefresh?.();
              })
              .catch((err) => {
                console.error('Failed to update flower note:', err);
              });
          });
        });

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'button button-icon button-secondary button-danger flower-grid-item-action-btn';
        removeBtn.setAttribute('aria-label', 'Remove flower');
        removeBtn.title = 'Remove flower';
        removeBtn.innerHTML = X_ICON_SVG;
        removeBtn.addEventListener('click', async () => {
          const confirmed = await showConfirmModal({
            title: 'Remove flower',
            message: 'Remove this flower from your collection? The link and note will be deleted.',
            confirmText: 'Remove',
            confirmDanger: true,
          });
          if (confirmed) {
            try {
              await deleteRecord('garden.spores.social.takenFlower', rkey);
              options?.onRefresh?.();
            } catch (err) {
              console.error('Failed to remove flower:', err);
            }
          }
        });

        actions.appendChild(editBtn);
        actions.appendChild(removeBtn);
        flowerEl.appendChild(actions);
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

/**
 * Opens a modal to edit the note. Calls onSave(newNote) when user clicks Save.
 */
function openEditNoteModal(currentNote: string, onSave: (newNote: string) => void) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Edit note</h2>
      <p>Change the note for this collected flower (optional, max 500 characters).</p>
      <form class="edit-flower-note-form">
        <div class="form-group">
          <label for="edit-flower-note">Note</label>
          <textarea
            id="edit-flower-note"
            class="textarea"
            placeholder="Why did you pick this flower?"
            maxlength="500"
            rows="3"
          ></textarea>
        </div>
        <div class="modal-actions">
          <button type="submit" class="button button-primary">Save</button>
          <button type="button" class="button button-secondary modal-close">Cancel</button>
        </div>
      </form>
    </div>
  `;

  const form = modal.querySelector('.edit-flower-note-form');
  const textarea = modal.querySelector('#edit-flower-note') as HTMLTextAreaElement;
  if (textarea) textarea.value = currentNote;

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const newNote = textarea?.value.trim() ?? '';
    modal.remove();
    onSave(newNote);
  });

  modal.querySelector('.modal-close')?.addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
}
