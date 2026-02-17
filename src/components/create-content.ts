/**
 * Modal for creating and editing content blocks.
 * Supports markdown content.
 */

import { createRecord, putRecord, getCurrentDid } from '../oauth';
import { addSection, updateSection, getSiteOwnerDid } from '../config';
import { getCollection } from '../config/nsid';
import { setCachedActivity } from './recent-gardens';

class CreateContent extends HTMLElement {
  private onClose: (() => void) | null = null;
  private contentTitle: string = '';
  private contentContent: string = '';
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

  editContent(contentData: {
    rkey?: string;
    sectionId?: string;
    title: string;
    content: string;
    format: string;
  }) {
    this.editMode = true;
    this.editRkey = contentData.rkey || null;
    this.editSectionId = contentData.sectionId || null;
    this.contentTitle = contentData.title || '';
    this.contentContent = contentData.content || '';
    this.show();
  }

  hide() {
    this.style.display = 'none';
  }

  private render() {
    this.className = 'modal';
    this.style.display = 'flex';
    this.innerHTML = `
      <div class="modal-content create-content-modal">
        <h2>${this.editMode ? 'Edit Content' : 'Create Content'}</h2>
        
        <div class="form-group">
          <label for="content-title">Title (optional)</label>
          <input type="text" id="content-title" class="input" placeholder="Content title" maxlength="200" value="${(this.contentTitle || '').replace(/"/g, '&quot;')}">
        </div>
        
        <div class="form-group">
          <label for="content-content">Content</label>
          <textarea id="content-content" class="textarea" rows="10" placeholder="Enter your content here..." required>${(this.contentContent || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
        </div>
        
        <div class="modal-actions">
          <button class="button button-primary" id="create-content-btn">${this.editMode ? 'Save Changes' : 'Create Content'}</button>
          <button class="button button-secondary modal-close">Cancel</button>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners() {
    const titleInput = this.querySelector('#content-title') as HTMLInputElement;
    const contentTextarea = this.querySelector('#content-content') as HTMLTextAreaElement;
    const createBtn = this.querySelector('#create-content-btn') as HTMLButtonElement;
    const cancelBtn = this.querySelector('.modal-close') as HTMLButtonElement;

    // Handle title input
    titleInput?.addEventListener('input', (e) => {
      this.contentTitle = (e.target as HTMLInputElement).value.trim();
    });

    // Handle content input
    contentTextarea?.addEventListener('input', (e) => {
      this.contentContent = (e.target as HTMLTextAreaElement).value;
    });

    // Handle create/save button
    createBtn?.addEventListener('click', async () => {
      if (!this.contentContent.trim()) {
        alert('Please enter some content.');
        return;
      }

      if (createBtn) {
        createBtn.disabled = true;
        createBtn.textContent = this.editMode ? 'Saving...' : 'Creating...';
      }

      try {
        if (this.editMode) {
          await this.updateContentRecord({
            title: this.contentTitle || undefined,
            content: this.contentContent
          });
        } else {
          await this.createContentRecord({
            title: this.contentTitle || undefined,
            content: this.contentContent
          });
        }

        this.close();
      } catch (error) {
        console.error(`Failed to ${this.editMode ? 'update' : 'create'} content:`, error);
        alert(`Failed to ${this.editMode ? 'update' : 'create'} content: ${error instanceof Error ? error.message : 'Unknown error'}`);
        if (createBtn) {
          createBtn.disabled = false;
          createBtn.textContent = this.editMode ? 'Save Changes' : 'Create Content';
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

  private async createContentRecord(contentData: {
    title?: string;
    content: string;
  }) {
    const contentTextCollection = getCollection('contentText');
    // Create the content record
    const record: any = {
      $type: contentTextCollection,
      content: contentData.content,
      format: 'markdown',
      createdAt: new Date().toISOString()
    };

    if (contentData.title) {
      record.title = contentData.title;
    }

    const response = await createRecord(contentTextCollection, record);

    // Extract rkey from the response URI
    const rkey = response.uri.split('/').pop();

    // Record local activity
    const currentDid = getCurrentDid();
    if (currentDid) {
      setCachedActivity(currentDid, 'edit', new Date());
    }

    // Add section to config referencing this content
    const section: any = {
      type: 'content',
      ref: response.uri,
      rkey: rkey,
      format: 'markdown'
    };

    // Only add title if provided
    if (contentData.title) {
      section.title = contentData.title;
    }

    addSection(section);

    // Trigger re-render
    window.dispatchEvent(new CustomEvent('config-updated'));
  }

  private async updateContentRecord(contentData: {
    title?: string;
    content: string;
  }) {
    const ownerDid = getSiteOwnerDid();
    if (!ownerDid) {
      throw new Error('Not logged in');
    }

    const contentTextCollection = getCollection('contentText');
    if (this.editRkey) {
      // Update existing content record
      const record: any = {
        $type: contentTextCollection,
        content: contentData.content,
        format: 'markdown',
        createdAt: new Date().toISOString()
      };

      if (contentData.title) {
        record.title = contentData.title;
      }

      await putRecord(contentTextCollection, this.editRkey, record);

      // Update section config if title changed
      if (this.editSectionId) {
        const updates: any = { format: 'markdown' };
        if (contentData.title) {
          updates.title = contentData.title;
        }
        updateSection(this.editSectionId, updates);
      }
    } else if (this.editSectionId) {
      // Update inline content section
      const updates: any = {
        content: contentData.content,
        format: 'markdown'
      };
      if (contentData.title) {
        updates.title = contentData.title;
      }
      updateSection(this.editSectionId, updates);
    }

    // Record local activity
    const currentDid = getCurrentDid();
    if (currentDid) {
      setCachedActivity(currentDid, 'edit', new Date());
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
    this.contentTitle = '';
    this.contentContent = '';
  }
}

customElements.define('create-content', CreateContent);
