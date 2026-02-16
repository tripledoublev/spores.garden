/**
 * Modal for creating and editing profile records.
 * Supports display name, pronouns, bio, avatar, and banner images with blob upload.
 */

import { createRecord, putRecord, uploadBlob } from '../oauth';
import { addSection, updateSection, getSiteOwnerDid } from '../config';
import { getRecord } from '../at-client';

// Type for blob reference as stored in AT Proto records
interface BlobRef {
  $type: 'blob';
  ref: {
    $link: string;
  };
  mimeType: string;
  size: number;
}

class CreateProfile extends HTMLElement {
  private onClose: (() => void) | null = null;
  private displayName: string = '';
  private pronouns: string = '';
  private description: string = '';
  private avatarFile: File | null = null;
  private bannerFile: File | null = null;
  private existingAvatar: BlobRef | null = null;
  private existingBanner: BlobRef | null = null;
  private editMode: boolean = false;
  private editRkey: string | null = null;
  private editSectionId: string | null = null;

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

  editProfile(profileData: {
    rkey?: string;
    sectionId?: string;
    displayName?: string;
    pronouns?: string;
    description?: string;
    avatar?: BlobRef;
    banner?: BlobRef;
  }) {
    this.editMode = true;
    this.editRkey = profileData.rkey || null;
    this.editSectionId = profileData.sectionId || null;
    this.displayName = profileData.displayName || '';
    this.pronouns = profileData.pronouns || '';
    this.description = profileData.description || '';
    this.existingAvatar = profileData.avatar || null;
    this.existingBanner = profileData.banner || null;
    this.avatarFile = null;
    this.bannerFile = null;
    this.show();
  }

  hide() {
    this.style.display = 'none';
  }

  private render() {
    this.className = 'modal';
    this.style.display = 'flex';

    const avatarPreview = this.avatarFile
      ? `<div class="selected-file">New: ${this.avatarFile.name}</div>`
      : this.existingAvatar
        ? `<div class="selected-file existing">Current avatar set</div>`
        : '';

    const bannerPreview = this.bannerFile
      ? `<div class="selected-file">New: ${this.bannerFile.name}</div>`
      : this.existingBanner
        ? `<div class="selected-file existing">Current banner set</div>`
        : '';

    this.innerHTML = `
      <div class="modal-content create-profile-modal">
        <h2>${this.editMode ? 'Edit Profile' : 'Create Profile'}</h2>
        
        <div class="form-group">
          <label for="profile-display-name">Display Name</label>
          <input type="text" id="profile-display-name" class="input" placeholder="Your name" maxlength="200" value="${(this.displayName || '').replace(/"/g, '&quot;')}">
        </div>

        <div class="form-group">
          <label for="profile-pronouns">Pronouns (optional)</label>
          <input type="text" id="profile-pronouns" class="input" placeholder="they/them" maxlength="100" value="${(this.pronouns || '').replace(/"/g, '&quot;')}">
        </div>
        
        <div class="form-group">
          <label for="profile-description">Description / Bio</label>
          <textarea id="profile-description" class="textarea" rows="6" placeholder="Tell us about yourself...">${(this.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
        </div>
        
        <div class="form-group">
          <label>Avatar Image</label>
          <div class="drop-zone" id="avatar-drop-zone">
            <div class="drop-zone-content">
              <span class="icon">👤</span>
              <p>Drag & drop avatar image</p>
              <p class="sub-text">or click to select (max 1MB)</p>
              ${avatarPreview}
            </div>
            <input type="file" id="avatar-input" class="file-input" accept="image/png,image/jpeg,image/webp,image/gif" style="display: none;">
          </div>
          ${this.existingAvatar || this.avatarFile ? `<button class="button button-small button-secondary clear-avatar-btn" style="margin-top: var(--spacing-sm);">Clear Avatar</button>` : ''}
        </div>
        
        <div class="form-group">
          <label>Banner Image (optional)</label>
          <div class="drop-zone" id="banner-drop-zone">
            <div class="drop-zone-content">
              <span class="icon">🖼️</span>
              <p>Drag & drop banner image</p>
              <p class="sub-text">or click to select (max 2MB)</p>
              ${bannerPreview}
            </div>
            <input type="file" id="banner-input" class="file-input" accept="image/png,image/jpeg,image/webp,image/gif" style="display: none;">
          </div>
          ${this.existingBanner || this.bannerFile ? `<button class="button button-small button-secondary clear-banner-btn" style="margin-top: var(--spacing-sm);">Clear Banner</button>` : ''}
        </div>
        
        <div class="modal-actions">
          <button class="button button-primary" id="create-profile-btn">${this.editMode ? 'Save Changes' : 'Create Profile'}</button>
          <button class="button button-secondary modal-close">Cancel</button>
        </div>
      </div>
    `;

    // Add styles for drop zone
    const style = document.createElement('style');
    style.textContent = `
      .create-profile-modal .drop-zone {
        border: 2px dashed var(--border-color);
        border-radius: var(--radius-md);
        padding: var(--spacing-lg);
        text-align: center;
        cursor: pointer;
        transition: all 0.2s ease;
        background: var(--bg-color-alt);
      }
      .create-profile-modal .drop-zone:hover, 
      .create-profile-modal .drop-zone.drag-over {
        border-color: var(--primary-color);
        background: var(--bg-color);
      }
      .create-profile-modal .drop-zone-content {
        pointer-events: none;
      }
      .create-profile-modal .drop-zone .icon {
        font-size: 32px;
        display: block;
        margin-bottom: var(--spacing-sm);
      }
      .create-profile-modal .drop-zone .sub-text {
        font-size: 0.85em;
        opacity: 0.7;
        margin-top: var(--spacing-xs);
      }
      .create-profile-modal .selected-file {
        margin-top: var(--spacing-sm);
        font-weight: bold;
        color: var(--primary-color);
        font-size: 0.9em;
      }
      .create-profile-modal .selected-file.existing {
        color: var(--text-color-muted);
      }
      .create-profile-modal .button-small {
        padding: var(--spacing-xs) var(--spacing-sm);
        font-size: 0.85em;
      }
    `;
    this.appendChild(style);

    this.attachEventListeners();
  }

  private attachEventListeners() {
    const displayNameInput = this.querySelector('#profile-display-name') as HTMLInputElement;
    const pronounsInput = this.querySelector('#profile-pronouns') as HTMLInputElement;
    const descriptionTextarea = this.querySelector('#profile-description') as HTMLTextAreaElement;
    const avatarDropZone = this.querySelector('#avatar-drop-zone') as HTMLDivElement;
    const avatarInput = this.querySelector('#avatar-input') as HTMLInputElement;
    const bannerDropZone = this.querySelector('#banner-drop-zone') as HTMLDivElement;
    const bannerInput = this.querySelector('#banner-input') as HTMLInputElement;
    const createBtn = this.querySelector('#create-profile-btn') as HTMLButtonElement;
    const cancelBtn = this.querySelector('.modal-close') as HTMLButtonElement;
    const clearAvatarBtn = this.querySelector('.clear-avatar-btn') as HTMLButtonElement;
    const clearBannerBtn = this.querySelector('.clear-banner-btn') as HTMLButtonElement;

    // Handle display name input
    displayNameInput?.addEventListener('input', (e) => {
      this.displayName = (e.target as HTMLInputElement).value.trim();
    });

    // Handle pronouns input
    pronounsInput?.addEventListener('input', (e) => {
      this.pronouns = (e.target as HTMLInputElement).value.trim();
    });

    // Handle description input
    descriptionTextarea?.addEventListener('input', (e) => {
      this.description = (e.target as HTMLTextAreaElement).value;
    });

    // Avatar drop zone handlers
    this.setupDropZone(avatarDropZone, avatarInput, 'avatar', 1000000);

    // Banner drop zone handlers
    this.setupDropZone(bannerDropZone, bannerInput, 'banner', 2000000);

    // Clear buttons
    clearAvatarBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.avatarFile = null;
      this.existingAvatar = null;
      this.render();
    });

    clearBannerBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.bannerFile = null;
      this.existingBanner = null;
      this.render();
    });

    // Handle create/save button
    createBtn?.addEventListener('click', async () => {
      if (createBtn) {
        createBtn.disabled = true;
        createBtn.textContent = this.editMode ? 'Saving...' : 'Creating...';
      }

      try {
        if (this.editMode) {
          await this.updateProfileRecord();
        } else {
          await this.createProfileRecord();
        }

        this.close();
      } catch (error) {
        console.error(`Failed to ${this.editMode ? 'update' : 'create'} profile:`, error);
        alert(`Failed to ${this.editMode ? 'update' : 'create'} profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
        if (createBtn) {
          createBtn.disabled = false;
          createBtn.textContent = this.editMode ? 'Save Changes' : 'Create Profile';
        }
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

  private setupDropZone(
    dropZone: HTMLDivElement | null,
    fileInput: HTMLInputElement | null,
    type: 'avatar' | 'banner',
    maxSize: number
  ) {
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        this.handleFileSelection(file, type, maxSize);
      }
    });

    fileInput.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        this.handleFileSelection(files[0], type, maxSize);
      }
    });
  }

  private handleFileSelection(file: File, type: 'avatar' | 'banner', maxSize: number) {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    const acceptedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!acceptedTypes.includes(file.type)) {
      alert('Please select a PNG, JPEG, WebP, or GIF image.');
      return;
    }

    if (file.size > maxSize) {
      const maxMB = maxSize / 1000000;
      alert(`File is too large. Maximum size is ${maxMB}MB.`);
      return;
    }

    if (type === 'avatar') {
      this.avatarFile = file;
      this.existingAvatar = null;
    } else {
      this.bannerFile = file;
      this.existingBanner = null;
    }

    this.render();
  }

  private async uploadImageBlob(file: File): Promise<BlobRef> {
    const uploadResult = await uploadBlob(file, file.type);
    const blobRef = uploadResult.data?.blob;

    if (!blobRef) {
      throw new Error('Upload successful but no blob reference returned');
    }

    return blobRef;
  }

  private async createProfileRecord() {
    const ownerDid = getSiteOwnerDid();
    if (!ownerDid) {
      throw new Error('Not logged in');
    }

    // Create the profile record
    const record: any = {
      $type: 'garden.spores.site.profile',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (this.displayName) {
      record.displayName = this.displayName;
    }
    if (this.pronouns) {
      record.pronouns = this.pronouns;
    }
    if (this.description) {
      record.description = this.description;
    }

    // Upload avatar if selected
    if (this.avatarFile) {
      record.avatar = await this.uploadImageBlob(this.avatarFile);
    }

    // Upload banner if selected
    if (this.bannerFile) {
      record.banner = await this.uploadImageBlob(this.bannerFile);
    }

    // Use 'self' as a consistent rkey for the user's profile
    await putRecord('garden.spores.site.profile', 'self', record);

    // Add section to config referencing this profile
    const section: any = {
      type: 'profile',
      collection: 'garden.spores.site.profile',
      rkey: 'self'
    };

    if (this.displayName) {
      section.title = this.displayName;
    }

    addSection(section);

    // Trigger re-render
    window.dispatchEvent(new CustomEvent('config-updated'));
  }

  private async updateProfileRecord() {
    const ownerDid = getSiteOwnerDid();
    if (!ownerDid) {
      throw new Error('Not logged in');
    }

    if (this.editRkey) {
      // Load existing record first to merge all fields
      let existingRecord: any = {};
      try {
        const existing = await getRecord(ownerDid, 'garden.spores.site.profile', this.editRkey);
        if (existing?.value) {
          existingRecord = existing.value;
        }
      } catch (error) {
        console.warn('Could not load existing record, creating new one:', error);
      }

      // Start with existing record and update only changed fields
      const record: any = {
        ...existingRecord,
        $type: 'garden.spores.site.profile',
        updatedAt: new Date().toISOString()
      };

      // Update displayName (even if empty string, as user may have cleared it)
      record.displayName = this.displayName;

      // Update description (even if empty string, as user may have cleared it)
      record.description = this.description;
      record.pronouns = this.pronouns;

      // Handle avatar: new file, existing blob, or cleared
      if (this.avatarFile) {
        record.avatar = await this.uploadImageBlob(this.avatarFile);
      } else if (this.existingAvatar) {
        record.avatar = this.existingAvatar;
      } else {
        // Avatar was explicitly cleared
        delete record.avatar;
      }

      // Handle banner: new file, existing blob, or cleared
      if (this.bannerFile) {
        record.banner = await this.uploadImageBlob(this.bannerFile);
      } else if (this.existingBanner) {
        record.banner = this.existingBanner;
      } else {
        // Banner was explicitly cleared
        delete record.banner;
      }

      // Preserve createdAt if it exists
      if (existingRecord.createdAt) {
        record.createdAt = existingRecord.createdAt;
      }

      await putRecord('garden.spores.site.profile', this.editRkey, record);

      // Update section config if displayName changed
      if (this.editSectionId && this.displayName) {
        updateSection(this.editSectionId, { title: this.displayName });
      }
    } else {
      // No rkey exists - create a new profile record and update section
      const record: any = {
        $type: 'garden.spores.site.profile',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (this.displayName) {
        record.displayName = this.displayName;
      }
      if (this.pronouns) {
        record.pronouns = this.pronouns;
      }
      if (this.description) {
        record.description = this.description;
      }

      // Upload avatar if selected
      if (this.avatarFile) {
        record.avatar = await this.uploadImageBlob(this.avatarFile);
      }

      // Upload banner if selected
      if (this.bannerFile) {
        record.banner = await this.uploadImageBlob(this.bannerFile);
      }

      // Use 'self' as a consistent rkey for the user's profile
      await putRecord('garden.spores.site.profile', 'self', record);

      // Update the section to reference the profile record
      if (this.editSectionId) {
        const updates: any = {
          collection: 'garden.spores.site.profile',
          rkey: 'self'
        };
        if (this.displayName) {
          updates.title = this.displayName;
        }
        updateSection(this.editSectionId, updates);
      }
    }

    // Trigger re-render
    window.dispatchEvent(new CustomEvent('config-updated'));
  }

  private close() {
    this.hide();
    if (this.onClose) {
      this.onClose();
    }
    // Reset form state
    this.editMode = false;
    this.editRkey = null;
    this.editSectionId = null;
    this.displayName = '';
    this.pronouns = '';
    this.description = '';
    this.avatarFile = null;
    this.bannerFile = null;
    this.existingAvatar = null;
    this.existingBanner = null;
  }
}

customElements.define('create-profile', CreateProfile);
