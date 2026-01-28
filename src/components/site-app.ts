/**
 * spores.garden - Main Entry Point
 * Refactored to use modular components.
 */

import { initConfig, getConfig } from '../config';
import { applyTheme } from '../themes/engine';
import { escapeHtml } from '../utils/sanitize';
import { SiteRouter } from './site-router';
import { SiteAuth } from './site-auth';
import { SiteEditor } from './site-editor';
import { SiteRenderer } from './site-renderer';
import { SiteInteractions } from './site-interactions';
import { SiteData } from './site-data';

// Styles
// Note: We don't import styles here as they are likely global or component-specific

class SiteApp extends HTMLElement {
  private auth: SiteAuth;
  private editor: SiteEditor;
  private renderer: SiteRenderer;
  private interactions: SiteInteractions;
  private data: SiteData;
  private isThemeReady = false;

  constructor() {
    super();

    // Define callbacks
    const renderCallback = () => this.renderer.render();
    const showNotification = (msg: string, type: 'success' | 'error' = 'success') =>
      this.renderer.showNotification(msg, type);

    // Initialize sub-components
    this.data = new SiteData(showNotification);

    this.interactions = new SiteInteractions(this, showNotification);

    this.editor = new SiteEditor(renderCallback, showNotification);

    this.auth = new SiteAuth(
      renderCallback,
      (type) => this.editor.showAddSectionModal(type),
      showNotification
    );

    this.renderer = new SiteRenderer(
      this,
      this.auth,
      this.editor,
      this.interactions,
      this.data
    );
  }

  async connectedCallback() {
    // Initial loading state
    this.innerHTML = `<div class="loading">${this.renderer.getLoadingMessage()}</div>`;

    try {
      // Initialize config
      const config = await initConfig();

      // Initialize Auth (OAuth, Listeners)
      await this.auth.init();

      // Listen for config updates
      window.addEventListener('config-updated', async () => {
        const config = getConfig();
        // Only apply theme when viewing a garden page, not on home page
        // We use SiteRouter for this check
        if (SiteRouter.isViewingProfile()) {
          await applyTheme(config.theme);
        }
        this.renderer.render();
      });

      // Listen for add section requests (e.g. from welcome modal or other parts)
      window.addEventListener('add-section', (e: Event) => {
        this.editor.editMode = true;
        this.editor.showAddSectionModal((e as CustomEvent).detail?.type);
        this.renderer.render();
      });

      // Listen for share to Bluesky requests
      window.addEventListener('share-to-bluesky', () => {
        this.interactions.shareToBluesky();
      });

      // Apply theme and wait for it to be fully applied before rendering
      await applyTheme(config.theme);
      this.isThemeReady = true;

      // Add theme-ready class for smooth content fade-in
      this.classList.add('theme-ready');

      // Render only after theme is ready
      await this.renderer.render();
    } catch (error) {
      console.error('Failed to initialize site:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.innerHTML = `
        <div class="error">
          <h2>Failed to load site</h2>
          <p>${escapeHtml(errorMessage)}</p>
          <button onclick="location.reload()">Try Again</button>
        </div>
      `;
    }
  }

  // Expose methods for console debugging/dev tools if needed
  public getComponents() {
    return {
      auth: this.auth,
      editor: this.editor,
      renderer: this.renderer,
      interactions: this.interactions,
      data: this.data
    };
  }
}

customElements.define('site-app', SiteApp);
