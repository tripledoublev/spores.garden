/**
 * Root component for spores.garden.
 * Loads config, initializes OAuth, renders sections, handles edit mode.
 */

import { initConfig, getConfig, getSiteOwnerDid, isOwner, saveConfig, setSiteOwnerDid, loadUserConfig, hasUserConfig, updateTheme } from '../config';
import { initOAuth, isLoggedIn, getCurrentDid, login, logout, createRecord, uploadBlob, post } from '../oauth';
import { applyTheme, generateThemeFromDid } from '../themes/engine';
import { escapeHtml } from '../utils/sanitize';
import { generateSocialCardImage } from '../utils/social-card';
import type { WelcomeModalElement, WelcomeAction } from '../types';
import './section-block';
import './welcome-modal';
import './create-content';
import './site-config';

class SiteApp extends HTMLElement {
  private hasShownWelcome = false;
  
  constructor() {
    super();
    this.editMode = false;
  }

  async connectedCallback() {
    // Determine loading message
    const loadingMessage = this.getLoadingMessage();
    this.innerHTML = `<div class="loading">${loadingMessage}</div>`;

    try {
      // Initialize config
      const config = await initConfig();

      // Initialize OAuth
      // For local dev, AT Protocol uses a special loopback client_id format
      // See: AT Protocol OAuth spec - "Localhost Client Development"
      // client_id must be exactly "http://localhost" (no port, no path)
      // redirect_uri and scope are passed as query parameters
      // Port numbers in redirect_uri are ignored during matching
      const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      const port = location.port || (location.protocol === 'https:' ? '443' : '80');
      const redirectUri = isLocalDev
        ? `http://127.0.0.1:${port}/`
        : `${location.origin}/`;
      const scope = 'atproto transition:generic';

      // Local dev: http://localhost?redirect_uri=...&scope=...
      // Production: uses client-metadata.json hosted at origin
      const clientId = isLocalDev
        ? `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`
        : `${location.origin}/client-metadata.json`;

      await initOAuth({
        oauth: {
          clientId,
          redirectUri,
          scope
        }
      });

      // Listen for auth changes
      window.addEventListener('auth-change', async (e) => {
        // If user logged in and no site owner set, they become the owner
        if (e.detail?.loggedIn && e.detail?.did && !getSiteOwnerDid()) {
          // Try to load existing config for this user
          const existingConfig = await loadUserConfig(e.detail.did);
          
          if (existingConfig) {
            // User has existing config - set as owner and don't show welcome
            setSiteOwnerDid(e.detail.did);
            // Apply theme from loaded config
            applyTheme(existingConfig.theme, existingConfig.customCss);
          } else {
            // New user - set as owner and show welcome
            setSiteOwnerDid(e.detail.did);
            // Show welcome modal for first-time users
            if (!this.hasShownWelcome) {
              this.showWelcome();
              this.hasShownWelcome = true;
            }
          }
        }
        this.render();
      });
      
      // Listen for config updates
      window.addEventListener('config-updated', () => {
        const config = getConfig();
        // Re-apply theme when config is updated
        applyTheme(config.theme, config.customCss);
        this.render();
      });
      
      // Listen for add section requests
      window.addEventListener('add-section', (e) => {
        this.editMode = true;
        this.showAddSectionModal(e.detail?.type);
        this.render();
      });

      // Listen for open config modal requests
      window.addEventListener('open-config-modal', () => {
        this.showConfigModal();
      });

      // If already logged in and no owner set, set current user as owner
      if (isLoggedIn() && !getSiteOwnerDid()) {
        const currentDid = getCurrentDid();
        // Try to load existing config for this user
        const existingConfig = await loadUserConfig(currentDid);
        
        if (existingConfig) {
          // User has existing config - set as owner and don't show welcome
          setSiteOwnerDid(currentDid);
          // Apply theme from loaded config
          applyTheme(existingConfig.theme, existingConfig.customCss);
        } else {
          // New user - set as owner and show welcome
          setSiteOwnerDid(currentDid);
          // Show welcome modal for first-time users
          if (!this.hasShownWelcome) {
            this.showWelcome();
            this.hasShownWelcome = true;
          }
        }
      }

      // Apply theme
      applyTheme(config.theme, config.customCss);

      // Render
      await this.render();
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

  async render() {
    const config = getConfig();
    const ownerDid = getSiteOwnerDid();
    const isOwnerLoggedIn = isOwner();

    // Update title and meta description
    document.title = config.title || 'spores.garden';
    const metaDescription = document.querySelector('#meta-description') as HTMLMetaElement;
    if (metaDescription) {
      metaDescription.content = config.description || 'A personal ATProto website';
    }

    this.innerHTML = '';

    // Header with site title and controls
    const header = document.createElement('header');
    header.className = 'header';

    // Title and subtitle container
    const titleContainer = document.createElement('div');
    titleContainer.style.display = 'flex';
    titleContainer.style.flexDirection = 'column';

    const title = document.createElement('h1');
    title.className = 'site-title';
    title.textContent = config.title || 'spores.garden';
    titleContainer.appendChild(title);

    // Add subtitle as h2
    const subtitle = document.createElement('h2');
    subtitle.className = 'site-subtitle';
    subtitle.textContent = config.subtitle || 'A personal ATProto website';
    titleContainer.appendChild(subtitle);

    header.appendChild(titleContainer);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'controls';

    // Hide login button when viewing a profile page
    const isViewingProfile = this.isViewingProfile();

    if (isLoggedIn()) {
      if (isOwnerLoggedIn) {
        // Garden configuration button
        const configBtn = document.createElement('button');
        configBtn.className = 'button button-secondary';
        configBtn.textContent = 'Config';
        configBtn.setAttribute('aria-label', 'Open garden configuration');
        configBtn.addEventListener('click', () => this.showConfigModal());
        controls.appendChild(configBtn);

        // Edit mode toggle
        const editBtn = document.createElement('button');
        editBtn.className = 'button button-secondary';
        editBtn.textContent = this.editMode ? 'Preview' : 'Edit';
        editBtn.setAttribute('aria-label', this.editMode ? 'Switch to preview mode' : 'Switch to edit mode');
        editBtn.setAttribute('aria-pressed', this.editMode.toString());
        editBtn.addEventListener('click', () => this.toggleEditMode());
        controls.appendChild(editBtn);

        // Share to Bluesky button
        const shareBtn = document.createElement('button');
        shareBtn.className = 'button button-secondary';
        shareBtn.textContent = 'Share to Bluesky';
        shareBtn.setAttribute('aria-label', 'Share your garden to Bluesky');
        shareBtn.addEventListener('click', () => this.shareToBluesky());
        controls.appendChild(shareBtn);
      } else if (!isOwnerLoggedIn && isViewingProfile) {
        // "Plant your flower" button for visitors
        const plantFlowerBtn = document.createElement('button');
        plantFlowerBtn.className = 'button button-primary';
        plantFlowerBtn.textContent = 'Plant your flower';
        plantFlowerBtn.setAttribute('aria-label', 'Plant your flower in this garden');
        plantFlowerBtn.addEventListener('click', () => this.plantFlower());
        controls.appendChild(plantFlowerBtn);

        // "Take this flower" button for visitors
        const takeFlowerBtn = document.createElement('button');
        takeFlowerBtn.className = 'button button-secondary';
        takeFlowerBtn.textContent = 'Take this flower';
        takeFlowerBtn.setAttribute('aria-label', 'Take this flower to your garden');
        takeFlowerBtn.addEventListener('click', () => this.takeFlower());
        controls.appendChild(takeFlowerBtn);
      }

      // Logout button
      const logoutBtn = document.createElement('button');
      logoutBtn.className = 'button button-ghost';
      logoutBtn.textContent = 'Logout';
      logoutBtn.setAttribute('aria-label', 'Log out of your account');
      logoutBtn.addEventListener('click', () => {
        logout();
        this.render();
      });
      controls.appendChild(logoutBtn);
    } else {
      // Login button - only show if not viewing a profile
      if (!isViewingProfile) {
        const loginBtn = document.createElement('button');
        loginBtn.className = 'button';
        loginBtn.textContent = 'Login';
        loginBtn.setAttribute('aria-label', 'Log in with AT Protocol');
        loginBtn.addEventListener('click', () => this.showLoginModal());
        controls.appendChild(loginBtn);
      }
    }

    header.appendChild(controls);
    this.appendChild(header);

    // Main content
    const main = document.createElement('main');
    main.className = 'main';

    // Render sections
    const sections = config.sections || [];

    if (sections.length === 0 && !this.editMode) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';

      if (isOwnerLoggedIn) {
        const text = document.createElement('h2');
        text.style.textAlign = 'center';
        text.style.display = 'flex';
        text.style.justifyContent = 'center';
        text.style.alignItems = 'baseline';
        text.style.flexWrap = 'wrap';
        
        const span1 = document.createElement('span');
        span1.textContent = 'Click ';
        text.appendChild(span1);

        const editButton = document.createElement('button');
        editButton.className = 'button button-primary';
        editButton.textContent = 'Edit';
        editButton.style.margin = '0 0.5rem';
        editButton.addEventListener('click', () => this.toggleEditMode());
        text.appendChild(editButton);

        const span2 = document.createElement('span');
        span2.textContent = ' to add sections.';
        text.appendChild(span2);

        emptyState.appendChild(text);
      } else {
        const heading = document.createElement('h2');
        heading.style.textAlign = 'center';
        heading.textContent = 'Login to create your garden';
        emptyState.appendChild(heading);
        
        const loginBtn = document.createElement('button');
        loginBtn.className = 'button';
        loginBtn.style.marginTop = 'var(--spacing-md)';
        loginBtn.textContent = 'Login';
        loginBtn.addEventListener('click', () => this.showLoginModal());
        emptyState.appendChild(loginBtn);
      }
      
      main.appendChild(emptyState);
    } else {
      for (const section of sections) {
        const sectionEl = document.createElement('section-block');
        sectionEl.setAttribute('data-section', JSON.stringify(section));
        sectionEl.setAttribute('data-edit-mode', this.editMode.toString());
        main.appendChild(sectionEl);
      }
    }

    // Add section button in edit mode
    if (this.editMode) {
      const addBtn = document.createElement('button');
      addBtn.className = 'add-section';
      addBtn.textContent = '+ Add Section';
      addBtn.setAttribute('aria-label', 'Add a new section to your garden');
      addBtn.addEventListener('click', () => this.showAddSectionModal());
      main.appendChild(addBtn);

      // Save button
      const saveBar = document.createElement('div');
      saveBar.className = 'save-bar';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'button button-primary save-btn';
      saveBtn.textContent = 'Save Changes';
      saveBtn.setAttribute('aria-label', 'Save your changes to the garden');
      saveBtn.addEventListener('click', () => this.save());
      saveBar.appendChild(saveBtn);
      main.appendChild(saveBar);
    }

    this.appendChild(main);
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    this.render();
  }

  showLoginModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Login with Bluesky</h2>
        <form class="login-form">
          <input type="text" placeholder="your.handle.com" class="input" required>
          <button type="submit" class="button">Login</button>
        </form>
        <button class="button button-secondary modal-close">Cancel</button>
      </div>
    `;

    modal.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const handle = modal.querySelector('input').value.trim();
      if (handle) {
        modal.remove();
        await login(handle);
      }
    });

    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
  }

  showWelcome() {
    // Check if any other modal is currently open
    const activeModals = document.querySelectorAll('.modal');
    if (activeModals.length > 0) {
      console.warn('Attempted to show welcome modal while other modals are active. Aborting.');
      return;
    }

    const welcome = document.createElement('welcome-modal');
    welcome.setOnClose(() => {
      this.render();
    });
    document.body.appendChild(welcome);
  }

  showAddSectionModal(preferredType?: string) {
    // If a type is preferred, skip the modal and add directly
    if (preferredType) {
      this.addSection(preferredType);
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Add Section</h2>
        <div class="section-types">
          <button data-type="profile" class="section-type">
            <span class="icon">👤</span>
            <span>Profile</span>
          </button>
          <button data-type="content" class="section-type">
            <span class="icon">📝</span>
            <span>Content</span>
          </button>
          <button data-type="guestbook" class="section-type">
            <span class="icon">📖</span>
            <span>Guestbook</span>
          </button>
          <button data-type="flower-bed" class="section-type">
            <span class="icon">🌸</span>
            <span>Flower Bed</span>
          </button>
          <button data-type="collected-flowers" class="section-type">
            <span class="icon">🌼</span>
            <span>Collected Flowers</span>
          </button>
          <button data-type="special-spore-display" class="section-type">
            <span class="icon">✨</span>
            <span>Special Spore</span>
          </button>
          <button data-action="load-records" class="section-type">
            <span class="icon">📚</span>
            <span>Load Records</span>
          </button>
          <button data-action="select-bsky-posts" class="section-type">
            <span class="icon">🦋</span>
            <span>Bluesky Posts</span>
          </button>
        </div>
        <button class="button button-secondary modal-close">Cancel</button>
      </div>
    `;

    modal.querySelectorAll('.section-type').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const action = btn.dataset.action;
        
        if (action) {
          modal.remove();
          this.handleWelcomeAction(action);
        } else if (type) {
          modal.remove();
          this.addSection(type);
        }
      });
    });

    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
  }

  handleWelcomeAction(action: WelcomeAction) {
    // Create a welcome component and trigger the appropriate action
    const welcome = document.createElement('welcome-modal') as WelcomeModalElement;
    welcome.setOnClose(() => {
      this.render();
    });
    document.body.appendChild(welcome);

    // Trigger the action after component is connected
    setTimeout(() => {
      welcome.triggerAction(action);
    }, 10);
  }

  addSection(type) {
    // If it's content, show the content creation modal
    if (type === 'content' || type === 'block') {
      this.showCreateContentModal();
      return;
    }

    const config = getConfig();
    const id = `section-${Date.now()}`;

    const section = {
      id,
      type,
      layout: type === 'profile' ? 'profile' : type === 'guestbook' ? 'guestbook' : type === 'flower-bed' ? 'flower-bed' : type === 'collected-flowers' ? 'collected-flowers' : type === 'special-spore-display' ? 'special-spore-display' : 'card',
      title: type === 'guestbook' ? 'Guestbook' : type === 'flower-bed' ? 'Flower Bed' : type === 'collected-flowers' ? 'Collected Flowers' : type === 'special-spore-display' ? 'Special Spore' : ''
    };

    config.sections = [...(config.sections || []), section];
    this.render();
  }

  async plantFlower() {
    if (!isLoggedIn()) {
      this.showNotification('You must be logged in to plant a flower.', 'error');
      return;
    }

    const ownerDid = getSiteOwnerDid();
    if (!ownerDid) {
      this.showNotification('Could not determine the garden owner.', 'error');
      return;
    }

    try {
      await createRecord('garden.spores.social.flower', {
        subject: ownerDid,
        createdAt: new Date().toISOString()
      });
      this.showNotification('You planted a flower in this garden!', 'success');
    } catch (error) {
      console.error('Failed to plant flower:', error);
      this.showNotification(`Failed to plant flower: ${error.message}`, 'error');
    }
  }

  async takeFlower() {
    if (!isLoggedIn()) {
      this.showNotification('You must be logged in to take a flower.', 'error');
      return;
    }

    const ownerDid = getSiteOwnerDid();
    if (!ownerDid) {
      this.showNotification('Could not determine the garden owner whose flower to take.', 'error');
      return;
    }

    try {
      await createRecord('garden.spores.social.takenFlower', {
        sourceDid: ownerDid,
        createdAt: new Date().toISOString()
      });
      this.showNotification('You took a flower from this garden!', 'success');
    } catch (error) {
      console.error('Failed to take flower:', error);
      this.showNotification(`Failed to take flower: ${error.message}`, 'error');
    }
  }

  async shareToBluesky() {
    if (!isLoggedIn()) {
      this.showNotification('You must be logged in to share to Bluesky.', 'error');
      return;
    }

    const currentDid = getCurrentDid();
    if (!currentDid) {
      this.showNotification('Could not determine your DID.', 'error');
      return;
    }

    try {
      this.showNotification('Generating social card and preparing post...', 'success');
      const imageBlob = await generateSocialCardImage();

      // 1. Upload image to Bluesky blob store
      const uploadedImage = await uploadBlob(imageBlob, 'image/png');

      // 2. Compose post
      const text = `Check out my unique garden on spores.garden! ${window.location.origin}/@${currentDid}`;
      const postRecord = {
        $type: 'app.bsky.feed.post',
        text: text,
        createdAt: new Date().toISOString(),
        embed: {
          $type: 'app.bsky.embed.images',
          images: [
            {
              alt: 'spores.garden social card',
              image: uploadedImage.data.blob,
            },
          ],
        },
      };

      // 3. Publish post
      await post(postRecord);

      this.showNotification('Successfully shared your garden to Bluesky!', 'success');
    } catch (error) {
      console.error('Failed to share to Bluesky:', error);
      this.showNotification(`Failed to share to Bluesky: ${error.message}`, 'error');
    }
  }


  showCreateContentModal() {
    // Check if modal already exists
    let modal = document.querySelector('create-content') as HTMLElement & { setOnClose: (cb: () => void) => void; show: () => void };
    
    if (!modal) {
      modal = document.createElement('create-content') as HTMLElement & { setOnClose: (cb: () => void) => void; show: () => void };
      document.body.appendChild(modal);
    }
    
    modal.setOnClose(() => {
      this.render();
    });
    
    modal.show();
  }

  showConfigModal() {
    // Check if modal already exists
    let modal = document.querySelector('.config-modal') as HTMLElement;
    
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal config-modal';
      
      const modalContent = document.createElement('div');
      modalContent.className = 'modal-content config-modal-content';
      
      const header = document.createElement('div');
      header.className = 'config-modal-header';
      header.innerHTML = `
        <h2>Garden Configuration</h2>
        <button class="button button-ghost modal-close" aria-label="Close">×</button>
      `;
      
      const configEditor = document.createElement('site-config');
      
      // Add save button footer
      const footer = document.createElement('div');
      footer.className = 'modal-actions';
      footer.innerHTML = `
        <button class="button button-primary" id="config-save-btn">Save Changes</button>
        <button class="button button-secondary modal-close">Cancel</button>
      `;
      
      modalContent.appendChild(header);
      modalContent.appendChild(configEditor);
      modalContent.appendChild(footer);
      modal.appendChild(modalContent);
      
      // Save button handler
      const saveBtn = footer.querySelector('#config-save-btn');
      saveBtn.addEventListener('click', async () => {
        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving...';
        }
        
        try {
          await saveConfig();
          // Close modal on success
          modal.remove();
          // Trigger re-render
          window.dispatchEvent(new CustomEvent('config-updated'));
        } catch (error) {
          console.error('Failed to save config:', error);
          alert(`Failed to save config: ${error instanceof Error ? error.message : 'Unknown error'}`);
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
          }
        }
      });
      
      // Close handlers
      const closeBtn = header.querySelector('.modal-close');
      closeBtn.addEventListener('click', () => {
        modal.remove();
      });
      
      const cancelBtn = footer.querySelector('.modal-close');
      cancelBtn.addEventListener('click', () => {
        modal.remove();
      });
      
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });
      
      document.body.appendChild(modal);
    }
    
    // Show modal
    modal.style.display = 'flex';
  }

  async save() {
    try {
      await saveConfig();
      this.showNotification('Changes saved!', 'success');
    } catch (error) {
      console.error('Failed to save:', error);
      this.showNotification(`Failed to save: ${error.message}`, 'error');
    }
  }

  showNotification(message: string, type: 'success' | 'error' = 'success') {
    // Remove any existing notification
    const existing = document.querySelector('.notification');
    if (existing) {
      existing.remove();
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-message">${this.escapeHtml(message)}</span>
        <button class="notification-close" aria-label="Close">×</button>
      </div>
    `;

    // Close button handler
    notification.querySelector('.notification-close')?.addEventListener('click', () => {
      notification.remove();
    });

    document.body.appendChild(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 200);
      }
    }, 3000);
  }

  escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Check if we're viewing a profile page (via /@ URL)
   */
  isViewingProfile(): boolean {
    const pathMatch = location.pathname.match(/^\/@(.+)$/);
    return pathMatch !== null;
  }

  /**
   * Get the appropriate loading message
   * If loading a specific garden (URL has did/handle), randomly choose between
   * "loading spores" and "loading garden"
   * Otherwise, show "loading your garden"
   */
  getLoadingMessage(): string {
    // Check if URL has a specific garden identifier
    const params = new URLSearchParams(location.search);
    const hasDidParam = params.has('did');
    const hasHandleParam = params.has('handle');
    
    // Check pathname for /@handle or /@did format
    const pathMatch = location.pathname.match(/^\/@(.+)$/);
    const hasPathIdentifier = pathMatch !== null;

    // If we're loading a specific garden, randomly choose message
    if (hasDidParam || hasHandleParam || hasPathIdentifier) {
      const messages = ['loading spores', 'loading garden'];
      return messages[Math.floor(Math.random() * messages.length)];
    }

    // Otherwise, show default message
    return 'Loading your garden...';
  }
}

customElements.define('site-app', SiteApp);