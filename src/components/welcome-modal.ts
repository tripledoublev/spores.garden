/**
 * <welcome> - Welcome modal shown after first login
 *
 * Provides action choices for users to build their site:
 * - Load records from their PDS
 * - Create content block
 * - Load predefined templates
 * - Select Bluesky posts to showcase
 */

import { getCollections, getAllRecords, groupByCollection } from '../records/loader';
import { getCurrentDid, getAgent } from '../oauth';
import { addSection, getConfig, updateConfig, updateTheme, saveConfig } from '../config';
import { getProfile } from '../at-client';
import { generateThemeFromDid } from '../themes/engine';
import { getSafeHandle, getDisplayHandle } from '../utils/identity';
import { SiteRouter } from './site-router';
import type { ATRecord } from '../types';
import './did-visualization';
import './theme-metadata';

type WelcomeAction =
  | 'load-records'
  | 'create-content'
  | 'select-bsky-posts';

class WelcomeModal extends HTMLElement {
  private did: string | null = null;
  private onClose: (() => void) | null = null;
  private onBack: (() => void) | null = null;
  private collections: string[] = [];
  private profile: any = null;

  async connectedCallback() {
    this.did = getCurrentDid();
    if (this.did) {
      this.profile = await getProfile(this.did);
    }
    this.render();
  }

  // Method to trigger an action directly (used when called from edit mode)
  triggerAction(action: WelcomeAction) {
    if (!this.did) {
      this.did = getCurrentDid();
    }

    // Ensure component is rendered
    if (!this.querySelector('.welcome-content')) {
      this.render();
    }

    // Wait for render to complete, then trigger action
    setTimeout(() => {
      switch (action) {
        case 'load-records':
          this.handleLoadRecords();
          break;
        case 'select-bsky-posts':
          this.handleSelectBskyPosts();
          break;
        case 'create-content':
          this.handleCreateContent();
          break;
      }
    }, 0);
  }

  setOnClose(callback: () => void) {
    this.onClose = callback;
  }

  setOnBack(callback: () => void) {
    this.onBack = callback;
  }

  private async render() {
    this.className = 'welcome-modal';
    this.innerHTML = `
      <div class="welcome-content">
        <div id="onboarding-step-1">
          <div class="welcome-header">
            <h1 class="welcome-title">Welcome to spores.garden</h1>
            <p class="welcome-subtitle">Let's get your garden started.</p>
          </div>
          <p>On Bluesky, you are known as <strong>${this.profile?.displayName || ''}</strong> (${getDisplayHandle(this.profile?.handle, this.did || '')}).</p>
          <p>On spores.garden, you can customize your page's headers before generating your unique theme.</p>
          <div class="form-group">
            <label for="site-title">Site Title (H1)</label>
            <input type="text" id="site-title" class="input" value="${this.profile?.displayName || ''}">
          </div>
          <div class="form-group">
            <label for="site-subtitle">Site Subtitle (H2)</label>
            <input type="text" id="site-subtitle" class="input" value="${(() => {
        const safe = getSafeHandle(this.profile?.handle, this.did || '');
        return safe === this.did ? '' : '@' + safe;
      })()}">
          </div>
          <button id="generate-styles-btn" class="button button-primary">Generate unique styles from your DID</button>
        </div>
        <div id="onboarding-step-2" style="display: none;">
          <h2 class="theme-generated-title">Your unique theme has been generated!</h2>
          <p class="theme-generated-subtitle">Here is a visualization of your DID:</p>
          <did-visualization did="${this.did}"></did-visualization>
          <p class="favicon-note">This is the generated favicon for your garden's page.</p>
          <div class="generative-art-explanation">
            <p>Your DID (Decentralized Identifier) generates a unique visual flower pattern. This is your digital signature—no two gardens look the same, and your flower remains consistent across the network.</p>
            <p>The colors, patterns, and shape are derived from your DID's cryptographic hash, creating a one-of-a-kind garden theme that's yours forever.</p>
          </div>
          <theme-metadata></theme-metadata>
          <button id="save-continue-btn" class="button button-primary">Save & Continue</button>
          </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners() {
    const generateBtn = this.querySelector('#generate-styles-btn');
    const saveBtn = this.querySelector('#save-continue-btn');
    const titleInput = this.querySelector('#site-title') as HTMLInputElement;
    const subtitleInput = this.querySelector('#site-subtitle') as HTMLInputElement;

    if (generateBtn) {
      generateBtn.addEventListener('click', () => {
        if (this.did) {
          const { theme, metadata } = generateThemeFromDid(this.did);
          updateTheme(theme);
          // Don't apply theme here - user is on home page during onboarding
          // Theme will be applied when they navigate to their garden

          if (titleInput && subtitleInput) {
            updateConfig({
              title: titleInput.value,
              subtitle: subtitleInput.value
            });
          }

          (this.querySelector('#onboarding-step-1') as HTMLElement).style.display = 'none';
          (this.querySelector('#onboarding-step-2') as HTMLElement).style.display = 'block';

          const themeMetadataEl = this.querySelector('theme-metadata');
          if (themeMetadataEl) {
            themeMetadataEl.setAttribute('metadata', JSON.stringify({ theme, metadata }));
          }
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        await saveConfig({ isInitialOnboarding: true });
        // Navigate to the user's garden after onboarding completes
        // This ensures they see their garden with the new theme, not the home page
        if (this.did) {
          await SiteRouter.navigateToGardenDid(this.did);
        } else {
          this.close();
        }
      });
    }
  }

  async handleLoadRecords() {
    if (!this.did) {
      this.showMessage('No DID found. Please log in again.');
      return;
    }

    this.showLoading('Loading your records...');

    try {
      this.collections = await getCollections(this.did);

      if (this.collections.length === 0) {
        this.showMessage('No collections found in your repository.');
        return;
      }

      this.showCollectionSelector(this.collections);
    } catch (error) {
      console.error('Failed to load collections:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.showMessage(`Failed to load records: ${errorMessage}. Please check your connection and try again.`);
    }
  }

  async handleSelectBskyPosts() {
    if (!this.did) {
      this.showMessage('No DID found. Please log in again.');
      return;
    }

    this.showLoading('Loading your Bluesky posts...');

    try {
      // Use the same method that works in "Explore your data"
      const { getCollectionRecords } = await import('../records/loader');
      const posts = await getCollectionRecords(this.did, 'app.bsky.feed.post', { limit: 50 });

      if (posts.length === 0) {
        this.showMessage('No posts found in your Bluesky feed.');
        return;
      }

      this.showPostSelector(posts);
    } catch (error) {
      console.error('Failed to load posts:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.showMessage(`Failed to load Bluesky posts: ${errorMessage}. Please try again.`);
    }
  }

  private handleCreateContent() {
    this.close(() => {
      // Dispatch event to trigger add section modal
      window.dispatchEvent(new CustomEvent('add-section', {
        detail: { type: 'content' }
      }));
    });
  }


  private showLoading(message: string) {
    this.innerHTML = `
      <div class="welcome-content">
        <div class="welcome-loading">
          <div class="spinner"></div>
          <p>${message}</p>
        </div>
      </div>
    `;
  }

  private showMessage(message: string) {
    const content = this.querySelector('.welcome-content');
    if (!content) return;

    content.innerHTML = `
      <div class="welcome-message">
        <p>${message}</p>
        <button class="button" data-action="back-main">Back</button>
      </div>
    `;

    content.querySelector('[data-action="back-main"]')?.addEventListener('click', () => {
      if (this.onBack) {
        this.onBack();
      } else {
        this.render();
      }
    });
  }

  private showCollectionSelector(collections: string[]) {
    const content = this.querySelector('.welcome-content');
    if (!content) return;

    content.innerHTML = `
      <div class="welcome-selector">
        <h2>Select Collection</h2>
        <p>Choose a collection to load records from</p>
        <div class="collection-list">
          ${collections.map(coll => `
            <button class="collection-item" data-collection="${coll}">
              <span class="collection-name">${coll}</span>
              <span class="collection-arrow">→</span>
            </button>
          `).join('')}
        </div>
        <button class="button button-secondary" data-action="back-main">Back</button>
      </div>
    `;

    // Attach back button listener
    content.querySelector('[data-action="back-main"]')?.addEventListener('click', () => {
      if (this.onBack) {
        this.onBack();
      } else {
        this.render();
      }
    });

    content.querySelectorAll('.collection-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const collection = btn.getAttribute('data-collection');
        if (!collection || !this.did) return;

        this.showLoading(`Loading records from ${collection}...`);

        try {
          const { getCollectionRecords } = await import('../records/loader');
          const records = await getCollectionRecords(this.did, collection, { limit: 20 });

          if (records.length === 0) {
            this.showMessage(`No records found in ${collection}.`);
            return;
          }

          this.showRecordSelector(collection, records);
        } catch (error) {
          console.error('Failed to load records:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.showMessage(`Failed to load records from ${collection}: ${errorMessage}. Please try again.`);
        }
      });
    });
  }

  private showRecordSelector(collection: string, records: ATRecord[]) {
    const content = this.querySelector('.welcome-content');
    if (!content) return;

    content.innerHTML = `
      <div class="welcome-selector">
        <h2>Select Records to Add</h2>
        <p>Choose records from ${collection} to add to your site</p>
        <div class="record-list">
          ${records.map((record, idx) => {
      const rkey = record.uri?.split('/').pop() || idx.toString();
      const val = record.value as any;
      const title = val?.text?.slice(0, 50) ||
        val?.title ||
        val?.name ||
        rkey;
      return `
              <label class="record-item">
                <input type="checkbox" value="${rkey}" data-uri="${record.uri || ''}">
                <span class="record-title">${title}</span>
              </label>
            `;
    }).join('')}
        </div>
        <div class="selector-actions">
          <button class="button" data-action="add-records" data-collection="${collection}">Add Selected</button>
          <button class="button button-secondary" data-action="back-collections">Back</button>
        </div>
      </div>
    `;

    // Attach event listeners
    content.querySelector('[data-action="add-records"]')?.addEventListener('click', () => {
      const collection = content.querySelector('[data-action="add-records"]')?.getAttribute('data-collection');
      if (collection) {
        this.addSelectedRecords(collection);
      }
    });

    content.querySelector('[data-action="back-collections"]')?.addEventListener('click', () => {
      this.showCollectionSelector(this.collections);
    });
  }

  private async addSelectedRecords(collection: string) {
    const selected = Array.from(this.querySelectorAll<HTMLInputElement>('.record-item input:checked'));

    if (selected.length === 0) {
      alert('Please select at least one record.');
      return;
    }

    // Add sections for selected records
    // Use 'records' type to show only the specific selected records, not all records from the collection
    for (const input of selected) {
      const uri = input.getAttribute('data-uri');
      if (!uri) continue;

      addSection({
        type: 'records',
        records: [uri],
        layout: 'card'
      });
    }

    this.close(() => {
      window.dispatchEvent(new CustomEvent('config-updated'));
    });
  }

  private showPostSelector(posts: ATRecord[]) {
    const content = this.querySelector('.welcome-content');
    if (!content) return;

    content.innerHTML = `
      <div class="welcome-selector">
        <h2>Select Bluesky Post</h2>
        <p>Choose a post to add to your garden</p>
        <div class="post-list">
          ${posts.map((post, idx) => {
      const rkey = post.uri?.split('/').pop() || idx.toString();
      const uri = post.uri || '';
      const val = post.value as any;
      const text = val?.text?.slice(0, 200) || 'Post';
      const createdAt = val?.createdAt
        ? new Date(val.createdAt).toLocaleDateString()
        : '';
      return `
              <button class="post-item-selectable" data-uri="${uri}" data-rkey="${rkey}">
                <div class="post-content">
                  <p class="post-text">${this.escapeHtml(text)}${text.length >= 200 ? '...' : ''}</p>
                  ${createdAt ? `<time class="post-date">${createdAt}</time>` : ''}
                </div>
              </button>
            `;
    }).join('')}
        </div>
        <div class="selector-actions">
          <button class="button button-secondary" data-action="back-main">Back</button>
        </div>
      </div>
    `;

    // Attach event listeners - clicking a post adds it
    content.querySelectorAll('.post-item-selectable').forEach(btn => {
      btn.addEventListener('click', () => {
        const uri = btn.getAttribute('data-uri');
        if (uri) {
          this.addSinglePost(uri);
        }
      });
    });

    content.querySelector('[data-action="back-main"]')?.addEventListener('click', () => {
      if (this.onBack) {
        this.onBack();
      } else {
        this.render();
      }
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private addSinglePost(uri: string) {
    // Add a single post as a records section
    addSection({
      type: 'records',
      records: [uri],
      layout: 'post'
    });

    this.close(() => {
      window.dispatchEvent(new CustomEvent('config-updated'));
    });
  }


  private close(callback?: () => void) {
    if (callback) {
      callback();
    }
    if (this.onClose) {
      this.onClose();
    }
    this.remove();
  }
}

customElements.define('welcome-modal', WelcomeModal);
