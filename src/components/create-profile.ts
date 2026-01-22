/**
 * Modal for creating and editing profile records.
 * Supports display name, bio, avatar, and banner images.
 */

import { createRecord, putRecord } from '../oauth';
import { addSection, updateSection, getSiteOwnerDid } from '../config';
import { getRecord } from '../at-client';

class CreateProfile extends HTMLElement {
  private onClose: (() => void) | null = null;
  private displayName: string = '';
  private description: string = '';
  private avatar: string = '';
  private banner: string = '';
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
    description?: string;
    avatar?: string;
    banner?: string;
  }) {
    this.editMode = true;
    this.editRkey = profileData.rkey || null;
    this.editSectionId = profileData.sectionId || null;
    this.displayName = profileData.displayName || '';
    this.description = profileData.description || '';
    this.avatar = profileData.avatar || '';
    this.banner = profileData.banner || '';
    this.show();
  }

  hide() {
    this.style.display = 'none';
  }

  private render() {
    this.className = 'modal';
    this.style.display = 'flex';
    this.innerHTML = `
      <div class="modal-content create-profile-modal">
        <h2>${this.editMode ? 'Edit Profile' : 'Create Profile'}</h2>
        
        <div class="form-group">
          <label for="profile-display-name">Display Name</label>
          <input type="text" id="profile-display-name" class="input" placeholder="Your name" maxlength="200" value="${(this.displayName || '').replace(/"/g, '&quot;')}">
        </div>
        
        <div class="form-group">
          <label for="profile-description">Description / Bio</label>
          <textarea id="profile-description" class="textarea" rows="6" placeholder="Tell us about yourself...">${(this.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
        </div>
        
        <div class="form-group">
          <label for="profile-avatar">Avatar Image URL</label>
          <input type="url" id="profile-avatar" class="input" placeholder="https://..." value="${(this.avatar || '').replace(/"/g, '&quot;')}">
          <small class="form-hint">URL to your profile picture</small>
        </div>
        
        <div class="form-group">
          <label for="profile-banner">Banner Image URL (optional)</label>
          <input type="url" id="profile-banner" class="input" placeholder="https://..." value="${(this.banner || '').replace(/"/g, '&quot;')}">
          <small class="form-hint">URL to a banner image</small>
        </div>
        
        <div class="modal-actions">
          <button class="button button-primary" id="create-profile-btn">${this.editMode ? 'Save Changes' : 'Create Profile'}</button>
          <button class="button button-secondary modal-close">Cancel</button>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners() {
    const displayNameInput = this.querySelector('#profile-display-name') as HTMLInputElement;
    const descriptionTextarea = this.querySelector('#profile-description') as HTMLTextAreaElement;
    const avatarInput = this.querySelector('#profile-avatar') as HTMLInputElement;
    const bannerInput = this.querySelector('#profile-banner') as HTMLInputElement;
    const createBtn = this.querySelector('#create-profile-btn') as HTMLButtonElement;
    const cancelBtn = this.querySelector('.modal-close') as HTMLButtonElement;
    
    // Handle display name input
    displayNameInput?.addEventListener('input', (e) => {
      this.displayName = (e.target as HTMLInputElement).value.trim();
    });
    
    // Handle description input
    descriptionTextarea?.addEventListener('input', (e) => {
      this.description = (e.target as HTMLTextAreaElement).value;
    });
    
    // Handle avatar input
    avatarInput?.addEventListener('input', (e) => {
      this.avatar = (e.target as HTMLInputElement).value.trim();
    });
    
    // Handle banner input
    bannerInput?.addEventListener('input', (e) => {
      this.banner = (e.target as HTMLInputElement).value.trim();
    });
    
    // Handle create/save button
    createBtn?.addEventListener('click', async () => {
      if (createBtn) {
        createBtn.disabled = true;
        createBtn.textContent = this.editMode ? 'Saving...' : 'Creating...';
      }
      
      try {
        if (this.editMode) {
          await this.updateProfileRecord({
            displayName: this.displayName || undefined,
            description: this.description || undefined,
            avatar: this.avatar || undefined,
            banner: this.banner || undefined
          });
        } else {
          await this.createProfileRecord({
            displayName: this.displayName || undefined,
            description: this.description || undefined,
            avatar: this.avatar || undefined,
            banner: this.banner || undefined
          });
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

  private async createProfileRecord(profileData: {
    displayName?: string;
    description?: string;
    avatar?: string;
    banner?: string;
  }) {
    // Create the profile record
    const record: any = {
      $type: 'garden.spores.site.profile',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    if (profileData.displayName) {
      record.displayName = profileData.displayName;
    }
    if (profileData.description) {
      record.description = profileData.description;
    }
    if (profileData.avatar) {
      record.avatar = profileData.avatar;
    }
    if (profileData.banner) {
      record.banner = profileData.banner;
    }
    
    const response = await createRecord('garden.spores.site.profile', record);
    
    // Extract rkey from the response URI
    const rkey = response.uri.split('/').pop();
    
    // Add section to config referencing this profile
    const section: any = {
      type: 'profile',
      collection: 'garden.spores.site.profile',
      rkey: rkey
    };
    
    if (profileData.displayName) {
      section.title = profileData.displayName;
    }
    
    addSection(section);
    
    // Trigger re-render
    window.dispatchEvent(new CustomEvent('config-updated'));
  }

  private async updateProfileRecord(profileData: {
    displayName?: string;
    description?: string;
    avatar?: string;
    banner?: string;
  }) {
    const ownerDid = getSiteOwnerDid();
    if (!ownerDid) {
      throw new Error('Not logged in');
    }

    if (this.editRkey) {
      // Update existing profile record
      const record: any = {
        $type: 'garden.spores.site.profile',
        updatedAt: new Date().toISOString()
      };
      
      if (profileData.displayName !== undefined) {
        record.displayName = profileData.displayName;
      }
      if (profileData.description !== undefined) {
        record.description = profileData.description;
      }
      if (profileData.avatar !== undefined) {
        record.avatar = profileData.avatar;
      }
      if (profileData.banner !== undefined) {
        record.banner = profileData.banner;
      }
      
      // Preserve createdAt if it exists
      try {
        const existing = await getRecord(ownerDid, 'garden.spores.site.profile', this.editRkey);
        if (existing?.value?.createdAt) {
          record.createdAt = existing.value.createdAt;
        }
      } catch (error) {
        console.warn('Could not load existing record to preserve createdAt:', error);
      }
      
      await putRecord('garden.spores.site.profile', this.editRkey, record);
      
      // Update section config if displayName changed
      if (this.editSectionId && profileData.displayName) {
        updateSection(this.editSectionId, { title: profileData.displayName });
      }
    } else {
      // No rkey exists - create a new profile record and update section
      const record: any = {
        $type: 'garden.spores.site.profile',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      if (profileData.displayName) {
        record.displayName = profileData.displayName;
      }
      if (profileData.description) {
        record.description = profileData.description;
      }
      if (profileData.avatar) {
        record.avatar = profileData.avatar;
      }
      if (profileData.banner) {
        record.banner = profileData.banner;
      }
      
      const response = await createRecord('garden.spores.site.profile', record);
      
      // Extract rkey from the response URI
      const rkey = response.uri.split('/').pop();
      
      // Update the section to reference the new profile record
      if (this.editSectionId) {
        const updates: any = {
          collection: 'garden.spores.site.profile',
          rkey: rkey
        };
        if (profileData.displayName) {
          updates.title = profileData.displayName;
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
    this.description = '';
    this.avatar = '';
    this.banner = '';
  }
}

customElements.define('create-profile', CreateProfile);
