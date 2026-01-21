/**
 * Root component for spores.garden.
 * Loads config, initializes OAuth, renders sections, handles edit mode.
 */

import { initConfig, getConfig, getSiteOwnerDid, isOwner, saveConfig, setSiteOwnerDid, loadUserConfig, hasUserConfig, updateTheme, hasGardenIdentifierInUrl } from '../config';
import { initOAuth, isLoggedIn, getCurrentDid, login, logout, createRecord, uploadBlob, post, getAgent, deleteRecord } from '../oauth';
import { getBacklinks, listRecords, describeRepo } from '../at-client';
import { applyTheme, generateThemeFromDid } from '../themes/engine';
import { escapeHtml } from '../utils/sanitize';
import { generateSocialCardImage } from '../utils/social-card';
import type { WelcomeModalElement, WelcomeAction } from '../types';
import './section-block';
import './welcome-modal';
import './create-content';
import './create-image';
import './site-config';

class SiteApp extends HTMLElement {
  private hasShownWelcome = false;
  private editMode = false;
  private renderId = 0;

  constructor() {
    super();
    this.editMode = false;
  }

  private navigateToGardenIdentifier(rawInput: string) {
    const input = rawInput.trim();
    if (!input) return;

    const withoutAt = input.startsWith('@') ? input.slice(1) : input;

    // DID form: did:plc:...
    if (withoutAt.startsWith('did:')) {
      location.href = `/?did=${encodeURIComponent(withoutAt)}`;
      return;
    }

    // Handle form: example.bsky.social
    location.href = `/?handle=${encodeURIComponent(withoutAt)}`;
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
      const redirectUri = `${location.origin}/`;
      const scope = 'atproto transition:generic';

      // Local dev: http://localhost?redirect_uri=...&scope=...
      // Production: uses client-metadata.json hosted at origin
      const clientId = isLocalDev
        ? `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`
        : `${location.origin}/client-metadata.json`;

      // Listen for auth changes - MUST be before initOAuth to catch events from OAuth callback
      window.addEventListener('auth-change', async (e: Event) => {
        const detail = (e as CustomEvent).detail;
        // If user logged in and no site owner set, they become the owner
        if (detail?.loggedIn && detail?.did && !getSiteOwnerDid()) {
          // Try to load existing config for this user
          const existingConfig = await loadUserConfig(detail.did);

          if (existingConfig) {
            // User has existing config - set as owner and don't show welcome
            setSiteOwnerDid(detail.did);
            // Apply theme from loaded config
            applyTheme(existingConfig.theme);
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

      await initOAuth({
        oauth: {
          clientId,
          redirectUri,
          scope
        }
      });

      // Listen for config updates
      window.addEventListener('config-updated', () => {
        const config = getConfig();
        // Re-apply theme when config is updated
        applyTheme(config.theme);
        this.render();
      });

      // Listen for add section requests
      window.addEventListener('add-section', (e) => {
        this.editMode = true;
        this.showAddSectionModal(e.detail?.type);
        this.render();
      });

      // Listen for share to Bluesky requests from sections
      window.addEventListener('share-to-bluesky', () => {
        this.shareToBluesky();
      });

      // Listen for open config modal requests
      window.addEventListener('open-config-modal', () => {
        this.showConfigModal();
      });

      // Apply theme
      applyTheme(config.theme);

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
    const myRenderId = ++this.renderId;
    const config = getConfig();
    const ownerDid = getSiteOwnerDid();
    const isOwnerLoggedIn = isOwner();
    const isHomePage = !this.isViewingProfile();

    // On home page, always show default title/subtitle regardless of login state
    const displayTitle = isHomePage ? 'spores.garden' : (config.title || 'spores.garden');
    const displaySubtitle = isHomePage ? 'A personal ATProto website' : (config.subtitle || 'A personal ATProto website');
    const displayDescription = isHomePage ? 'A personal ATProto website' : (config.description || 'A personal ATProto website');

    // Update title and meta description
    document.title = displayTitle;
    const metaDescription = document.querySelector('#meta-description') as HTMLMetaElement;
    if (metaDescription) {
      metaDescription.content = displayDescription;
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
    title.textContent = displayTitle;
    titleContainer.appendChild(title);

    // Add subtitle as h2
    const subtitle = document.createElement('h2');
    subtitle.className = 'site-subtitle';
    subtitle.textContent = displaySubtitle;
    titleContainer.appendChild(subtitle);

    header.appendChild(titleContainer);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'controls';

    // Hide login button when viewing a profile page
    const isViewingProfile = this.isViewingProfile();

    if (isLoggedIn()) {
      if (isOwnerLoggedIn && !isHomePage) {
        // Garden configuration button (only on profile pages, not home)
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

        // Preview Sharecard button
        const previewSharecardBtn = document.createElement('button');
        previewSharecardBtn.className = 'button button-secondary';
        previewSharecardBtn.textContent = 'Preview Sharecard';
        previewSharecardBtn.setAttribute('aria-label', 'Preview the social card image for your garden');
        previewSharecardBtn.addEventListener('click', () => this.previewSharecard());
        controls.appendChild(previewSharecardBtn);

        // Share to Bluesky button
        const shareBtn = document.createElement('button');
        shareBtn.className = 'button button-secondary';
        shareBtn.textContent = 'Share to Bluesky';
        shareBtn.setAttribute('aria-label', 'Share your garden to Bluesky');
        shareBtn.addEventListener('click', () => this.shareToBluesky());
        controls.appendChild(shareBtn);
      } else if (isHomePage) {
        // On home page when logged in, show "View My Garden" button
        const currentDid = getCurrentDid();
        if (currentDid) {
          const viewMyGardenBtn = document.createElement('button');
          viewMyGardenBtn.className = 'button button-primary';
          viewMyGardenBtn.textContent = 'View My Garden';
          viewMyGardenBtn.setAttribute('aria-label', 'Go to your garden');
          viewMyGardenBtn.addEventListener('click', () => {
            location.href = `/@${currentDid}`;
          });
          controls.appendChild(viewMyGardenBtn);
        }
      } else if (!isOwnerLoggedIn && isViewingProfile) {
        // Check if user already interacted with this garden
        const currentDid = getCurrentDid();
        const [hasPlantedFlower, hasTakenSeed] = await Promise.all([
          this.checkHasPlantedFlower(ownerDid, currentDid),
          this.checkHasTakenSeed(currentDid, ownerDid)
        ]);

        // Guard against race conditions - if a new render started while we were awaiting, abort
        if (this.renderId !== myRenderId) return;

        // "View My Garden" button for visitors
        if (currentDid) {
          const viewMyGardenBtn = document.createElement('button');
          viewMyGardenBtn.className = 'button button-secondary';
          viewMyGardenBtn.textContent = 'My Garden';
          viewMyGardenBtn.setAttribute('aria-label', 'Go to your garden');
          viewMyGardenBtn.addEventListener('click', () => {
            location.href = `/@${currentDid}`;
          });
          controls.appendChild(viewMyGardenBtn);
        }

        // "Plant a flower" button for visitors
        const plantFlowerBtn = document.createElement('button');
        plantFlowerBtn.className = 'button button-primary';
        if (hasPlantedFlower) {
          plantFlowerBtn.textContent = 'Already planted';
          plantFlowerBtn.disabled = true;
          plantFlowerBtn.setAttribute('aria-label', 'You have already planted a flower in this garden');
          plantFlowerBtn.title = 'You have already planted a flower in this garden';
        } else {
          plantFlowerBtn.textContent = 'Plant a flower';
          plantFlowerBtn.setAttribute('aria-label', 'Plant a flower in this garden - Leave your unique flower as a way to show appreciation');
          plantFlowerBtn.title = 'Leave your unique flower in this garden as a way to show appreciation';
          plantFlowerBtn.addEventListener('click', () => this.plantFlower());
        }
        controls.appendChild(plantFlowerBtn);

        // "Take a seed" button for visitors
        const takeFlowerBtn = document.createElement('button');
        takeFlowerBtn.className = 'button button-secondary';
        if (hasTakenSeed) {
          takeFlowerBtn.textContent = 'Already collected';
          takeFlowerBtn.disabled = true;
          takeFlowerBtn.setAttribute('aria-label', 'You have already collected a seed from this garden');
          takeFlowerBtn.title = 'You have already collected a seed from this garden';
        } else {
          takeFlowerBtn.textContent = 'Take a seed';
          takeFlowerBtn.setAttribute('aria-label', 'Take a seed from this garden to plant in your own');
          takeFlowerBtn.title = 'Collect a seed from this garden to plant in your own';
          takeFlowerBtn.addEventListener('click', () => this.takeFlower());
        }
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
      // Login button (top-right). Show when logged out, including when viewing someone else's garden.
      const loginBtn = document.createElement('button');
      loginBtn.className = 'button';
      loginBtn.textContent = 'Login';
      loginBtn.setAttribute(
        'aria-label',
        isViewingProfile ? 'Log in to interact with this garden' : 'Log in with AT Protocol'
      );
      loginBtn.addEventListener('click', () => this.showLoginModal());
      controls.appendChild(loginBtn);
    }

    header.appendChild(controls);
    this.appendChild(header);

    // Main content
    const main = document.createElement('main');
    main.className = 'main';

    // Render sections - but NOT on home page (home page only shows recent gardens)
    const sections = config.sections || [];

    if (isHomePage) {
      // Home page: show homepage view with login option and recent gardens
      const homepageView = document.createElement('div');
      homepageView.className = 'homepage-view';

      if (!isLoggedIn()) {
        const heading = document.createElement('h2');
        heading.style.textAlign = 'center';
        heading.textContent = 'Login to start gardening!';
        homepageView.appendChild(heading);

        const loginBtn = document.createElement('button');
        loginBtn.className = 'button';
        loginBtn.style.marginTop = 'var(--spacing-md)';
        loginBtn.textContent = 'Login';
        loginBtn.addEventListener('click', () => this.showLoginModal());
        homepageView.appendChild(loginBtn);
      } else {
        // Logged in: show "View My Garden" button
        const currentDid = getCurrentDid();
        if (currentDid) {
          const heading = document.createElement('h2');
          heading.style.textAlign = 'center';
          heading.textContent = 'Welcome back!';
          homepageView.appendChild(heading);

          const viewMyGardenBtn = document.createElement('button');
          viewMyGardenBtn.className = 'button button-primary';
          viewMyGardenBtn.style.marginTop = 'var(--spacing-md)';
          viewMyGardenBtn.textContent = 'View My Garden';
          viewMyGardenBtn.setAttribute('aria-label', 'Go to your garden');
          viewMyGardenBtn.addEventListener('click', () => {
            location.href = `/@${currentDid}`;
          });
          homepageView.appendChild(viewMyGardenBtn);
        }
      }

      // Recent gardens display inside homepage view
      const recentGardens = document.createElement('recent-gardens');
      recentGardens.setAttribute('data-limit', '12');
      recentGardens.setAttribute('data-show-empty', 'true');
      recentGardens.style.marginTop = 'var(--spacing-xl)';
      recentGardens.style.textAlign = 'left';
      homepageView.appendChild(recentGardens);

      main.appendChild(homepageView);
    } else if (sections.length === 0 && !this.editMode) {
      // Viewing a profile with no sections
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
        heading.textContent = 'This garden is empty.';
        emptyState.appendChild(heading);
      }

      main.appendChild(emptyState);
    } else {
      // Viewing a profile with sections
      for (const section of sections) {
        const sectionEl = document.createElement('section-block');
        sectionEl.setAttribute('data-section', JSON.stringify(section));
        sectionEl.setAttribute('data-edit-mode', this.editMode.toString());

        // Listen for share-to-bluesky events from share sections
        sectionEl.addEventListener('share-to-bluesky', () => {
          this.shareToBluesky();
        });

        main.appendChild(sectionEl);
      }
    }

    // Add section button in edit mode (only on profile pages, not home)
    if (this.editMode && !isHomePage) {
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

    // Dev tool: Reset button (only on localhost/127.0.0.1 AND logged in)
    const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocalDev && isLoggedIn()) {
      const devResetBtn = document.createElement('button');
      devResetBtn.className = 'dev-reset-button';
      devResetBtn.textContent = 'Reset Garden Data';
      devResetBtn.setAttribute('aria-label', 'Delete all garden.spores.* localStorage and PDS records (dev only)');
      devResetBtn.title = 'Delete all garden.spores.* localStorage and PDS records';
      devResetBtn.addEventListener('click', () => this.resetGardenData());
      this.appendChild(devResetBtn);
    }
  }

  async resetGardenData() {
    const confirmReset = confirm('This will delete all garden.spores.* records from localStorage AND your PDS. Are you sure?');
    if (!confirmReset) return;

    const currentDid = getCurrentDid();
    if (!currentDid) {
      this.showNotification('Could not determine your DID.', 'error');
      return;
    }

    this.showNotification('Deleting garden data...', 'success');

    let deletedLocalStorage = 0;
    let deletedPdsRecords = 0;
    const errors: string[] = [];

    try {
      // 1. Delete localStorage records
      const keysToDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('garden.spores.')) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => localStorage.removeItem(key));
      deletedLocalStorage = keysToDelete.length;

      // 2. Delete PDS records - dynamically discover all garden.spores.* collections
      let gardenCollections: string[] = [];
      try {
        const repoInfo = await describeRepo(currentDid, getAgent());
        // Filter collections to only include garden.spores.* ones
        gardenCollections = (repoInfo.collections || []).filter((col: string) => col.startsWith('garden.spores.'));
        console.log(`Found ${gardenCollections.length} garden.spores.* collections:`, gardenCollections);
      } catch (error) {
        console.error('Failed to describe repo, using fallback collection list:', error);
        // Fallback to known collections if describeRepo fails
        gardenCollections = [
          'garden.spores.config',
          'garden.spores.site.config',
          'garden.spores.site.sections',
          'garden.spores.site.style',
          'garden.spores.social.flower',
          'garden.spores.social.takenFlower',
          'garden.spores.content.block',
          'garden.spores.content.image'
        ];
      }

      // For each collection, list and delete all records
      for (const collection of gardenCollections) {
        try {
          console.log(`Checking collection: ${collection}`);
          const response = await listRecords(currentDid, collection, { limit: 100 }, getAgent());
          console.log(`Response for ${collection}:`, response);
          const records = response?.records || [];
          console.log(`Found ${records.length} records in ${collection}`);

          for (const record of records) {
            try {
              // Extract rkey from the URI (format: at://did/collection/rkey)
              const uriParts = record.uri.split('/');
              const rkey = uriParts[uriParts.length - 1];

              console.log(`Deleting ${collection}/${rkey}`);
              await deleteRecord(collection, rkey);
              deletedPdsRecords++;
            } catch (error) {
              console.error(`Failed to delete record ${record.uri}:`, error);
              errors.push(`${collection}/${record.uri.split('/').pop()}`);
            }
          }
        } catch (error) {
          // Collection might not exist, which is fine
          console.log(`Error checking ${collection}:`, error);
        }
      }

      // Show summary
      let message = `Deleted ${deletedLocalStorage} localStorage records and ${deletedPdsRecords} PDS records.`;
      if (errors.length > 0) {
        message += ` Failed to delete ${errors.length} records.`;
      }
      message += ' Reloading...';

      this.showNotification(message, errors.length > 0 ? 'error' : 'success');

      // Reload the page after a short delay
      setTimeout(() => {
        location.reload();
      }, 2000);
    } catch (error) {
      console.error('Failed to reset garden data:', error);
      this.showNotification(`Failed to reset: ${error.message}`, 'error');
    }
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

    const welcome = document.createElement('welcome-modal') as WelcomeModalElement;
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
          <button data-type="image" class="section-type">
            <span class="icon">🖼️</span>
            <span>Image</span>
          </button>
          <button data-type="smoke-signal" class="section-type">
            <span class="icon">💨</span>
            <span>Smoke Signal Event</span>
          </button>
          <button data-type="leaflet" class="section-type">
            <span class="icon">📄</span>
            <span>leaflet.pub Article</span>
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
          <div class="section-type-helper">
            Load Records (Advanced): Load any AT Protocol record type to display. Rendering may vary—experiment and see what works!
          </div>
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

    // If it's image, show the create image modal
    if (type === 'image') {
      this.showCreateImageModal();
      return;
    }

    // If it's smoke-signal, create a records section with smoke-signal layout
    if (type === 'smoke-signal') {
      const config = getConfig();
      const id = `section-${Date.now()}`;
      const section = {
        id,
        type: 'records',
        layout: 'smoke-signal',
        title: 'Events',
        records: [] // User can add event records via Load Records or section editing
      };
      config.sections = [...(config.sections || []), section];
      this.render();
      return;
    }

    // If it's leaflet, create a records section with leaflet layout
    if (type === 'leaflet') {
      const config = getConfig();
      const id = `section-${Date.now()}`;
      const section = {
        id,
        type: 'records',
        layout: 'leaflet',
        title: 'Leaflet Posts',
        records: [] // User can add leaflet.pub article records via Load Records or section editing
      };
      config.sections = [...(config.sections || []), section];
      this.render();
      return;
    }

    const config = getConfig();
    const id = `section-${Date.now()}`;

    const section = {
      id,
      type,
      layout: type === 'profile' ? 'profile' : type === 'flower-bed' ? 'flower-bed' : type === 'collected-flowers' ? 'collected-flowers' : type === 'special-spore-display' ? 'special-spore-display' : 'card',
      title: type === 'flower-bed' ? 'Flower Bed' : type === 'collected-flowers' ? 'Collected Flowers' : type === 'special-spore-display' ? 'Special Spore' : ''
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
      this.showNotification('You planted a flower! It will appear in the Flower Bed section.', 'success');
      // Refresh to show the new flower
      this.render();
    } catch (error) {
      console.error('Failed to plant flower:', error);
      this.showNotification(`Failed to plant flower: ${error.message}`, 'error');
    }
  }

  async takeFlower() {
    if (!isLoggedIn()) {
      this.showNotification('You must be logged in to take a seed.', 'error');
      return;
    }

    const ownerDid = getSiteOwnerDid();
    if (!ownerDid) {
      this.showNotification('Could not determine the garden owner.', 'error');
      return;
    }

    // Show modal to optionally add a note
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Take a Seed</h2>
        <p>Collect a seed from this garden to plant in your own.</p>
        <form class="take-seed-form">
          <div class="form-group">
            <label for="seed-note">Note (optional)</label>
            <textarea 
              id="seed-note" 
              class="textarea" 
              placeholder="Why are you collecting this seed? (optional)"
              maxlength="500"
              rows="3"
            ></textarea>
            <small class="form-hint">Add a note to remember why you collected this seed</small>
          </div>
          <div class="modal-actions">
            <button type="submit" class="button button-primary">Take Seed</button>
            <button type="button" class="button button-secondary modal-close">Cancel</button>
          </div>
        </form>
      </div>
    `;

    const form = modal.querySelector('.take-seed-form');
    const noteInput = modal.querySelector('#seed-note') as HTMLTextAreaElement;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const note = noteInput.value.trim();

      modal.remove();

      try {
        const recordData: any = {
          sourceDid: ownerDid,
          createdAt: new Date().toISOString()
        };

        // Only include note if provided
        if (note) {
          recordData.note = note;
        }

        await createRecord('garden.spores.social.takenFlower', recordData);
        this.showNotification('Seed collected! View it in your Collected Flowers section.', 'success');
      } catch (error) {
        console.error('Failed to take flower:', error);
        this.showNotification(`Failed to take seed: ${error.message}`, 'error');
      }
    });

    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
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

  async previewSharecard() {
    try {
      this.showNotification('Generating social card preview...', 'success');
      const imageBlob = await generateSocialCardImage();

      // Convert blob to data URL for preview
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;

        // Create modal to display the preview
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
          <div class="modal-content" style="max-width: 800px;">
            <h2>Social Card Preview</h2>
            <div style="margin: var(--spacing-md) 0;">
              <img src="${dataUrl}" alt="Social card preview" style="width: 100%; border-radius: var(--border-radius); border: 1px solid var(--border-color);">
            </div>
            <div class="modal-actions">
              <button class="button button-primary modal-close">Close</button>
            </div>
          </div>
        `;

        modal.querySelector('.modal-close')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
          if (e.target === modal) modal.remove();
        });

        document.body.appendChild(modal);
      };
      reader.readAsDataURL(imageBlob);
    } catch (error) {
      console.error('Failed to generate social card preview:', error);
      this.showNotification(`Failed to generate preview: ${error.message}`, 'error');
    }
  }


  showCreateImageModal() {
    // Check if modal already exists
    let modal = document.querySelector('create-image') as HTMLElement & { setOnClose: (cb: () => void) => void; show: () => void };

    if (!modal) {
      modal = document.createElement('create-image') as HTMLElement & { setOnClose: (cb: () => void) => void; show: () => void };
      document.body.appendChild(modal);
    }

    modal.setOnClose(() => {
      this.render();
    });

    modal.show();
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
    return hasGardenIdentifierInUrl();
  }

  /**
   * Get the appropriate loading message
   * If loading a specific garden (URL has did/handle), randomly choose between
   * "loading spores" and "loading garden"
   * Otherwise, show "loading your garden"
   */
  getLoadingMessage(): string {
    // If we're loading a specific garden, randomly choose message
    if (hasGardenIdentifierInUrl()) {
      const messages = ['loading spores', 'loading garden'];
      return messages[Math.floor(Math.random() * messages.length)];
    }

    // Otherwise, show default message
    return 'Loading your garden...';
  }

  /**
   * Check if current user has already planted a flower in the given garden
   */
  async checkHasPlantedFlower(ownerDid: string, currentDid: string | null): Promise<boolean> {
    if (!currentDid) return false;

    try {
      const response = await getBacklinks(ownerDid, 'garden.spores.social.flower:subject', { limit: 100 });
      const plantedFlowers = response.records || response.links || [];
      return plantedFlowers.some(flower => flower.did === currentDid);
    } catch (error) {
      console.error('Failed to check planted flowers:', error);
      return false;
    }
  }

  /**
   * Check if current user has already taken a seed from the given garden
   */
  async checkHasTakenSeed(currentDid: string | null, ownerDid: string): Promise<boolean> {
    if (!currentDid) return false;

    try {
      const response = await listRecords(currentDid, 'garden.spores.social.takenFlower', { limit: 100 });
      const takenFlowers = response.records || [];
      return takenFlowers.some(record => record.value?.sourceDid === ownerDid);
    } catch (error) {
      console.error('Failed to check taken seeds:', error);
      return false;
    }
  }
}

customElements.define('site-app', SiteApp);