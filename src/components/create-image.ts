/**
 * Modal for uploading images and creating image records.
 * Supports drag & drop and file selection.
 */

import { createRecord, uploadBlob } from '../oauth';
import { addSection, getSiteOwnerDid } from '../config';

class CreateImage extends HTMLElement {
    private onClose: (() => void) | null = null;
    private imageTitle: string = '';
    private selectedFile: File | null = null;

    connectedCallback() {
        this.render();
    }

    setOnClose(callback: () => void) {
        this.onClose = callback;
    }

    show() {
        this.style.display = 'flex';
        this.render();
    }

    hide() {
        this.style.display = 'none';
    }

    private render() {
        this.className = 'modal';
        this.style.display = 'flex';
        this.innerHTML = `
      <div class="modal-content create-image-modal">
        <h2>Add Image</h2>
        
        <div class="form-group">
          <label for="image-title">Title (optional)</label>
          <input type="text" id="image-title" class="input" placeholder="Image title" maxlength="200" value="${(this.imageTitle || '').replace(/"/g, '&quot;')}">
        </div>
        
        <div class="form-group">
          <label>Image File</label>
          <div class="drop-zone" id="drop-zone">
            <div class="drop-zone-content">
              <span class="icon">🖼️</span>
              <p>Drag & drop an image here</p>
              <p class="sub-text">or click to select</p>
              ${this.selectedFile ? `<div class="selected-file">Selected: ${this.selectedFile.name}</div>` : ''}
            </div>
            <input type="file" id="image-input" class="file-input" accept="image/*" style="display: none;">
          </div>
        </div>
        
        <div class="modal-actions">
          <button class="button button-primary" id="create-image-btn" ${!this.selectedFile ? 'disabled' : ''}>Upload & Add</button>
          <button class="button button-secondary modal-close">Cancel</button>
        </div>
      </div>
    `;

        // Add styles for drop zone
        const style = document.createElement('style');
        style.textContent = `
      .drop-zone {
        border: 2px dashed var(--border-color);
        border-radius: var(--radius-md);
        padding: var(--spacing-xl);
        text-align: center;
        cursor: pointer;
        transition: all 0.2s ease;
        background: var(--bg-color-alt);
      }
      .drop-zone:hover, .drop-zone.drag-over {
        border-color: var(--primary-color);
        background: var(--bg-color);
      }
      .drop-zone-content {
        pointer-events: none;
      }
      .drop-zone .icon {
        font-size: 48px;
        display: block;
        margin-bottom: var(--spacing-md);
      }
      .drop-zone .sub-text {
        font-size: 0.9em;
        opacity: 0.7;
      }
      .selected-file {
        margin-top: var(--spacing-sm);
        font-weight: bold;
        color: var(--primary-color);
      }
    `;
        this.appendChild(style);

        this.attachEventListeners();
    }

    private attachEventListeners() {
        const titleInput = this.querySelector('#image-title') as HTMLInputElement;
        const dropZone = this.querySelector('#drop-zone') as HTMLDivElement;
        const fileInput = this.querySelector('#image-input') as HTMLInputElement;
        const createBtn = this.querySelector('#create-image-btn') as HTMLButtonElement;
        const cancelBtn = this.querySelector('.modal-close') as HTMLButtonElement;

        // Handle title input
        titleInput?.addEventListener('input', (e) => {
            this.imageTitle = (e.target as HTMLInputElement).value.trim();
        });

        // Handle Drop Zone
        dropZone?.addEventListener('click', () => {
            fileInput.click();
        });

        dropZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone?.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');

            if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (file.type.startsWith('image/')) {
                    this.handleFileSelection(file);
                } else {
                    alert('Please select an image file.');
                }
            }
        });

        fileInput?.addEventListener('change', (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && files.length > 0) {
                this.handleFileSelection(files[0]);
            }
        });

        // Handle create button
        createBtn?.addEventListener('click', async () => {
            if (!this.selectedFile) {
                alert('Please select an image file.');
                return;
            }

            createBtn.disabled = true;
            createBtn.textContent = 'Uploading...';

            try {
                await this.createImageRecord();
                this.close();
            } catch (error) {
                console.error('Failed to upload image:', error);
                alert(`Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`);
                createBtn.disabled = false;
                createBtn.textContent = 'Upload & Add';
            }
        });

        // Handle cancel button
        cancelBtn?.addEventListener('click', () => this.close());

        // Handle backdrop click
        this.addEventListener('click', (e) => {
            if (e.target === this) {
                this.close();
            }
        });
    }

    private handleFileSelection(file: File) {
        this.selectedFile = file;
        // Re-render to show selected file
        this.render();
    }

    private async createImageRecord() {
        if (!this.selectedFile) return;

        const ownerDid = getSiteOwnerDid();
        if (!ownerDid) {
            throw new Error('Not logged in');
        }

        // 1. Upload Blob
        const uploadResult = await uploadBlob(this.selectedFile, this.selectedFile.type);

        // Handle different response structures from atcute/api vs our wrapper
        const blobRef = uploadResult.data?.blob;

        if (!blobRef) {
            throw new Error('Upload successful but no blob reference returned');
        }

        // 2. Create Record
        const record: any = {
            $type: 'garden.spores.content.image',
            image: blobRef,
            createdAt: new Date().toISOString()
        };

        if (this.imageTitle) {
            record.title = this.imageTitle;
        }

        const response = await createRecord('garden.spores.content.image', record) as any;

        // Extract rkey
        const rkey = response.uri.split('/').pop();

        // 3. Add Section
        const section: any = {
            type: 'records',
            layout: 'image',
            title: this.imageTitle || 'Image',
            records: [response.uri]
        };

        addSection(section);

        // Trigger re-render
        window.dispatchEvent(new CustomEvent('config-updated'));
    }

    private close() {
        this.hide();
        if (this.onClose) {
            this.onClose();
        }
        // Reset state
        this.imageTitle = '';
        this.selectedFile = null;
    }
}

customElements.define('create-image', CreateImage);
