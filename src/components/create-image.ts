/**
 * Modal for uploading images and creating image records.
 * Supports drag & drop and file selection.
 */

import { createRecord, putRecord, uploadBlob, getCurrentDid } from '../oauth';
import { addSection, getSiteOwnerDid, updateSection } from '../config';
import { getCollection } from '../config/nsid';
import { clearCache } from '../records/loader';
import { setCachedActivity } from './recent-gardens';

class CreateImage extends HTMLElement {
    private onClose: (() => void) | null = null;
    private imageTitle: string = '';
    private selectedFile: File | null = null;
    private selectedFileUrl: string | null = null;
    private editMode: boolean = false;
    private editRkey: string | null = null;
    private editSectionId: string | null = null;
    private existingImageUrl: string | null = null;
    private existingImageBlob: any | null = null;
    private existingCreatedAt: string | null = null;
    private imageCleared: boolean = false;

    private async getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                const width = img.naturalWidth;
                const height = img.naturalHeight;
                URL.revokeObjectURL(url);
                resolve(width > 0 && height > 0 ? { width, height } : null);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(null);
            };
            img.src = url;
        });
    }

    private isHeicMime(mimeType: string): boolean {
        const mime = (mimeType || '').toLowerCase();
        return mime === 'image/heic' || mime === 'image/heif';
    }

    private async normalizeUploadFile(file: File): Promise<{ file: File; width?: number; height?: number }> {
        const originalDims = await this.getImageDimensions(file);

        if (!this.isHeicMime(file.type)) {
            if (!originalDims) return { file };
            return { file, width: originalDims.width, height: originalDims.height };
        }

        if (!originalDims) {
            throw new Error('HEIC/HEIF image could not be decoded by this browser. Please convert it to JPEG or WebP and try again.');
        }

        const sourceUrl = URL.createObjectURL(file);
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Failed to decode HEIC/HEIF image.'));
            img.src = sourceUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || originalDims.width;
        canvas.height = img.naturalHeight || originalDims.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            URL.revokeObjectURL(sourceUrl);
            throw new Error('Image conversion is not supported in this browser.');
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(sourceUrl);

        const convertedBlob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.92);
        });
        if (!convertedBlob) {
            throw new Error('Failed to convert HEIC/HEIF image to WebP.');
        }

        const webpName = file.name.replace(/\.[^.]+$/, '') + '.webp';
        const convertedFile = new File([convertedBlob], webpName, {
            type: 'image/webp',
            lastModified: Date.now(),
        });

        return { file: convertedFile, width: canvas.width, height: canvas.height };
    }

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

    editImage(imageData: {
        rkey: string;
        sectionId?: string;
        title?: string;
        imageUrl?: string | null;
        imageBlob?: any | null;
        createdAt?: string | null;
    }) {
        this.editMode = true;
        this.editRkey = imageData.rkey;
        this.editSectionId = imageData.sectionId || null;
        this.imageTitle = imageData.title || '';
        this.existingImageUrl = imageData.imageUrl || null;
        this.existingImageBlob = imageData.imageBlob || null;
        this.existingCreatedAt = imageData.createdAt || null;
        this.imageCleared = false;
        this.show();
    }

    hide() {
        this.style.display = 'none';
    }

    private render() {
        this.className = 'modal';
        this.style.display = 'flex';
        const canSave = this.editMode
            ? !!(this.selectedFile || (!this.imageCleared && this.existingImageBlob))
            : !!this.selectedFile;

        const currentPreview = this.selectedFileUrl || this.existingImageUrl;

        this.innerHTML = `
      <div class="modal-content create-image-modal">
        <h2>${this.editMode ? 'Edit Image' : 'Add Image'}</h2>

        ${this.editMode ? `
        <div class="form-group">
          <label>Current Image</label>
          <div class="image-preview">
            ${currentPreview && !this.imageCleared
                    ? `<img src="${currentPreview}" alt="Current image" />`
                    : '<div class="image-preview-empty">No image selected</div>'}
          </div>
          <div class="image-preview-actions">
            <button class="button button-secondary button-small" id="clear-image-btn" ${!currentPreview || this.imageCleared ? 'disabled' : ''}>Clear Image</button>
          </div>
        </div>
        ` : ''}
        
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
          <button class="button button-primary" id="create-image-btn" ${!canSave ? 'disabled' : ''}>${this.editMode ? 'Save Changes' : 'Upload & Add'}</button>
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
      .image-preview {
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        padding: var(--spacing-md);
        background: var(--bg-color-alt);
        text-align: center;
      }
      .image-preview img {
        max-width: 100%;
        max-height: 240px;
        border-radius: var(--radius-sm);
        display: block;
        margin: 0 auto;
      }
      .image-preview-empty {
        color: var(--text-muted);
        font-size: 0.9em;
      }
      .image-preview-actions {
        margin-top: var(--spacing-sm);
        display: flex;
        gap: var(--spacing-sm);
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
        const clearBtn = this.querySelector('#clear-image-btn') as HTMLButtonElement | null;

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
            createBtn.disabled = true;
            createBtn.textContent = this.editMode ? 'Saving...' : 'Uploading...';

            try {
                if (this.editMode) {
                    await this.updateImageRecord();
                } else {
                    await this.createImageRecord();
                }
                this.close();
            } catch (error) {
                console.error('Failed to upload image:', error);
                alert(`Failed to ${this.editMode ? 'update' : 'upload'} image: ${error instanceof Error ? error.message : 'Unknown error'}`);
                createBtn.disabled = false;
                createBtn.textContent = this.editMode ? 'Save Changes' : 'Upload & Add';
            }
        });

        clearBtn?.addEventListener('click', () => {
            this.imageCleared = true;
            this.existingImageUrl = null;
            this.existingImageBlob = null;
            this.render();
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
        if (this.selectedFileUrl) {
            URL.revokeObjectURL(this.selectedFileUrl);
        }
        this.selectedFile = file;
        this.selectedFileUrl = URL.createObjectURL(file);
        this.imageCleared = false;
        // Re-render to show selected file
        this.render();
    }

    private async createImageRecord() {
        if (!this.selectedFile) return;
        const imageCollection = getCollection('contentImage');

        const ownerDid = getSiteOwnerDid();
        if (!ownerDid) {
            throw new Error('Not logged in');
        }

        // 1. Normalize image (HEIC/HEIF -> WebP), then upload blob
        const normalized = await this.normalizeUploadFile(this.selectedFile);
        const uploadResult = await uploadBlob(normalized.file, normalized.file.type);

        // Handle different response structures from atcute/api vs our wrapper
        const blobRef = uploadResult.data?.blob;

        if (!blobRef) {
            throw new Error('Upload successful but no blob reference returned');
        }

        // 2. Create Record
        const record: any = {
            $type: imageCollection,
            image: blobRef,
            createdAt: new Date().toISOString(),
            embed: {
                $type: 'app.bsky.embed.images',
                images: [
                    {
                        alt: this.imageTitle || 'Garden image',
                        image: blobRef,
                        ...(normalized.width && normalized.height
                            ? {
                                aspectRatio: {
                                    width: normalized.width,
                                    height: normalized.height,
                                },
                            }
                            : {}),
                    },
                ],
            },
        };

        if (this.imageTitle) {
            record.title = this.imageTitle;
        }

        const response = await createRecord(imageCollection, record) as any;

        // Extract rkey
        const rkey = response.uri.split('/').pop();

        // 3. Add Section
        const section: any = {
            type: 'records',
            layout: 'image',
            title: this.imageTitle || 'Image',
            records: [response.uri],
            ref: response.uri,
            collection: imageCollection,
            rkey
        };

        addSection(section);

        // Record local activity
        const currentDid = getCurrentDid();
        if (currentDid) {
            setCachedActivity(currentDid, 'edit', new Date());
        }

        // Trigger re-render
        window.dispatchEvent(new CustomEvent('config-updated'));
    }

    private async updateImageRecord() {
        const ownerDid = getSiteOwnerDid();
        if (!ownerDid) {
            throw new Error('Not logged in');
        }

        if (!this.editRkey) {
            throw new Error('Missing image record key');
        }

        const imageCollection = getCollection('contentImage');
        let blobRef = null;
        let aspectRatio: { width: number; height: number } | null = null;
        if (this.selectedFile) {
            const normalized = await this.normalizeUploadFile(this.selectedFile);
            if (normalized.width && normalized.height) {
                aspectRatio = { width: normalized.width, height: normalized.height };
            }
            const uploadResult = await uploadBlob(normalized.file, normalized.file.type);
            blobRef = uploadResult.data?.blob;
        } else if (!this.imageCleared && this.existingImageBlob) {
            blobRef = this.existingImageBlob;
        }

        if (!blobRef) {
            throw new Error('Please select an image file.');
        }

        const record: any = {
            $type: imageCollection,
            image: blobRef,
            createdAt: this.existingCreatedAt || new Date().toISOString(),
            embed: {
                $type: 'app.bsky.embed.images',
                images: [
                    {
                        alt: this.imageTitle || 'Garden image',
                        image: blobRef,
                        ...(aspectRatio ? { aspectRatio } : {}),
                    },
                ],
            },
        };

        if (this.imageTitle) {
            record.title = this.imageTitle;
        }

        await putRecord(imageCollection, this.editRkey, record);

        clearCache(ownerDid);

        if (this.editSectionId) {
            updateSection(this.editSectionId, {
                title: this.imageTitle || ''
            });
        }

        // Record local activity
        const currentDid = getCurrentDid();
        if (currentDid) {
            setCachedActivity(currentDid, 'edit', new Date());
        }

        window.dispatchEvent(new CustomEvent('config-updated'));
    }

    private close() {
        this.hide();
        if (this.onClose) {
            this.onClose();
        }
        // Reset state
        if (this.selectedFileUrl) {
            URL.revokeObjectURL(this.selectedFileUrl);
        }
        this.selectedFileUrl = null;
        this.imageTitle = '';
        this.selectedFile = null;
        this.editMode = false;
        this.editRkey = null;
        this.editSectionId = null;
        this.existingImageUrl = null;
        this.existingImageBlob = null;
        this.existingCreatedAt = null;
        this.imageCleared = false;
    }
}

customElements.define('create-image', CreateImage);
