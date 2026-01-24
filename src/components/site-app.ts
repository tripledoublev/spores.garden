/**
 * Root component for spores.garden.
 * Loads config, initializes OAuth, renders sections, handles edit mode.
 */

import { initConfig, getConfig, getSiteOwnerDid, isOwner, saveConfig, setSiteOwnerDid, loadUserConfig, hasUserConfig, updateTheme, hasGardenIdentifierInUrl } from '../config';
import { initOAuth, isLoggedIn, getCurrentDid, login, logout, createRecord, uploadBlob, post, getAgent, deleteRecord, putRecord } from '../oauth';
import { getBacklinks, listRecords, describeRepo, getRecord, getProfile } from '../at-client';
import { applyTheme, generateThemeFromDid } from '../themes/engine';
import { escapeHtml } from '../utils/sanitize';
import { generateSocialCardImage } from '../utils/social-card';
import { generateFlowerSVGString } from '../utils/flower-svg';
import { showConfirmModal } from '../utils/confirm-modal';
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
  private isThemeReady = false;

  constructor() {
    super();
    this.editMode = false;
    this.isThemeReady = false;
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
        // If user logged in and no site owner set (home page), they become the owner
        if (detail?.loggedIn && detail?.did && !getSiteOwnerDid()) {
          // Try to load existing config for this user
          const existingConfig = await loadUserConfig(detail.did);

          if (existingConfig) {
            // User has existing config - set as owner and don't show welcome
            setSiteOwnerDid(detail.did);
            // Only apply user's theme if viewing their own garden, not on home page
            if (this.isViewingOwnGarden(detail.did)) {
              await applyTheme(existingConfig.theme);
            }
          } else {
            // New user - set as owner and show welcome
            setSiteOwnerDid(detail.did);
            // Check if user has completed onboarding before (localStorage backup)
            const hasCompletedOnboarding = this.hasCompletedOnboarding(detail.did);
            // Also check PDS as primary source of truth
            const hasConfig = await hasUserConfig(detail.did);

            // Show welcome modal only for truly new users
            if (!this.hasShownWelcome && !hasCompletedOnboarding && !hasConfig) {
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
      window.addEventListener('config-updated', async () => {
        const config = getConfig();
        // Only apply theme when viewing a garden page, not on home page
        if (this.isViewingProfile()) {
          await applyTheme(config.theme);
        }
        this.render();
      });

      // Listen for add section requests
      window.addEventListener('add-section', (e: Event) => {
        this.editMode = true;
        this.showAddSectionModal((e as CustomEvent).detail?.type);
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

      // Apply theme and wait for it to be fully applied before rendering
      await applyTheme(config.theme);
      this.isThemeReady = true;

      // Add theme-ready class for smooth content fade-in
      this.classList.add('theme-ready');

      // Render only after theme is ready
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

    // Update favicon based on the garden owner's DID (only when viewing a garden)
    // This ensures the favicon shows the garden owner's flower, not any other flower that might render later
    if (!isHomePage && ownerDid) {
      this.updateFavicon(ownerDid);
    } else if (isHomePage) {
      this.updateFavicon(null);
    }

    // On home page, always show default title/subtitle regardless of login state
    const displayTitle = isHomePage ? 'spores.garden' : (config.title || 'spores.garden');
    const displaySubtitle = isHomePage ? 'A personal ATProto website' : (config.subtitle || 'A personal ATProto website');

    // Update title and meta description
    document.title = displayTitle;
    const metaDescription = document.querySelector('#meta-description') as HTMLMetaElement;
    if (metaDescription) {
      metaDescription.content = displaySubtitle;
    }

    this.innerHTML = '';

    // Header with site title and controls
    const header = document.createElement('header');
    header.className = 'header';

    // Left group: home button + title/subtitle
    const leftGroup = document.createElement('div');
    leftGroup.className = 'header-left';

    // Home button with dandelion icon
    const homeButton = document.createElement('a');
    homeButton.href = '/';
    homeButton.className = 'home-button';
    homeButton.setAttribute('aria-label', 'Go to home page');
    homeButton.title = 'Go to home page';
    homeButton.innerHTML = this.getDandelionIcon();
    leftGroup.appendChild(homeButton);

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

    leftGroup.appendChild(titleContainer);
    header.appendChild(leftGroup);

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

        // Edit/Save mode toggle
        const editBtn = document.createElement('button');
        editBtn.className = this.editMode ? 'button button-primary' : 'button button-secondary';
        editBtn.textContent = this.editMode ? 'Save' : 'Edit';
        editBtn.setAttribute('aria-label', this.editMode ? 'Save changes and exit edit mode' : 'Enter edit mode');
        editBtn.setAttribute('aria-pressed', this.editMode.toString());
        editBtn.addEventListener('click', () => this.editMode ? this.saveAndExitEdit() : this.toggleEditMode());
        controls.appendChild(editBtn);

        // Share on Bluesky button (opens preview modal with post option)
        const shareBtn = document.createElement('button');
        shareBtn.className = 'button button-secondary';
        shareBtn.textContent = 'Share on Bluesky';
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
        plantFlowerBtn.className = 'button button-primary plant-flower-btn';
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

    // Mobile menu toggle button (hamburger)
    const menuToggle = document.createElement('button');
    menuToggle.className = 'mobile-menu-toggle';
    menuToggle.setAttribute('aria-label', 'Toggle menu');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    `;

    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = controls.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', isOpen.toString());
      // Toggle between hamburger and X icon
      menuToggle.innerHTML = isOpen ? `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="6" y1="6" x2="18" y2="18"/>
          <line x1="6" y1="18" x2="18" y2="6"/>
        </svg>
      ` : `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      `;
    });

    // Close menu when clicking outside
    const closeMenuOnClickOutside = (e: Event) => {
      if (!header.contains(e.target as Node) && controls.classList.contains('open')) {
        controls.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        `;
      }
    };
    document.addEventListener('click', closeMenuOnClickOutside);

    header.appendChild(menuToggle);
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
        // Logged in: show "View My Garden" button with personalized greeting
        const currentDid = getCurrentDid();
        if (currentDid) {
          const heading = document.createElement('h2');
          heading.style.textAlign = 'center';
          heading.textContent = 'Welcome back!';
          homepageView.appendChild(heading);

          // Fetch display name asynchronously and update greeting
          this.getDisplayNameForDid(currentDid).then(displayName => {
            if (displayName && this.renderId === myRenderId) {
              heading.textContent = `Welcome back, ${displayName}!`;
            }
          });
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

      // Save button (secondary, at bottom of edit mode)
      const saveBar = document.createElement('div');
      saveBar.className = 'save-bar';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'button button-primary save-btn';
      saveBtn.textContent = 'Save Changes';
      saveBtn.setAttribute('aria-label', 'Save your changes and exit edit mode');
      saveBtn.addEventListener('click', () => this.saveAndExitEdit());
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
    const confirmReset = await showConfirmModal({
      title: 'Reset Garden Data',
      message: 'This will delete all your garden data and log you out. Are you sure?',
      confirmText: 'Delete All',
      cancelText: 'Cancel',
      confirmDanger: true,
    });
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
        if (key && key.startsWith('spores.garden.')) {
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
      message += ' Logging out...';

      this.showNotification(message, errors.length > 0 ? 'error' : 'success');

      // Logout and redirect to root after a short delay
      setTimeout(() => {
        logout();
        location.href = '/';
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

  async saveAndExitEdit() {
    try {
      await saveConfig();
      this.editMode = false;
      this.showNotification('Changes saved!', 'success');
      this.render();
    } catch (error) {
      console.error('Failed to save:', error);
      this.showNotification(`Failed to save: ${error.message}`, 'error');
    }
  }

  showLoginModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content login-modal-content">
        <h2>Login with Bluesky or ATProto</h2>
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
      // Mark onboarding complete when welcome modal closes
      // This serves as a backup in case PDS save fails
      const currentDid = getCurrentDid();
      if (currentDid) {
        this.markOnboardingComplete(currentDid);
      }
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
          <button data-action="select-bsky-posts" class="section-type">
            <span class="icon">🦋</span>
            <span>Bluesky Posts</span>
          </button>
          <button data-type="content" class="section-type">
            <span class="icon">📝</span>
            <span>Custom Content</span>
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
        </div>
        <button class="button button-secondary modal-close">Cancel</button>
      </div>
    `;

    modal.querySelectorAll('.section-type').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = (btn as HTMLElement).dataset.type;
        const action = (btn as HTMLElement).dataset.action;

        modal.remove();

        // Route actions to dedicated methods - NO welcome-modal
        if (action === 'select-bsky-posts') {
          this.showBskyPostSelector();
        } else if (action === 'load-records') {
          this.showRecordsLoader();
        } else if (type) {
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
    welcome.setOnBack(() => {
      welcome.remove();
      this.showAddSectionModal();
    });
    document.body.appendChild(welcome);

    // Trigger the action after component is connected
    setTimeout(() => {
      welcome.triggerAction(action);
    }, 10);
  }

  async showBskyPostSelector() {
    const did = getCurrentDid();
    if (!did) return;

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="welcome-loading"><div class="spinner"></div><p>Loading your Bluesky posts...</p></div>
      </div>
    `;
    document.body.appendChild(modal);

    // Close handlers
    const closeModal = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    try {
      const { getCollectionRecords } = await import('../records/loader');
      const posts = await getCollectionRecords(did, 'app.bsky.feed.post', { limit: 50 });

      if (posts.length === 0) {
        modal.querySelector('.modal-content')!.innerHTML = `
          <p>No posts found in your Bluesky feed.</p>
          <button class="button modal-close">Close</button>
        `;
        modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
        return;
      }

      this.renderPostSelector(modal, posts, closeModal);
    } catch (error) {
      modal.querySelector('.modal-content')!.innerHTML = `
        <p>Failed to load posts. Please try again.</p>
        <button class="button modal-close">Close</button>
      `;
      modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
    }
  }

  private renderPostSelector(modal: HTMLElement, posts: any[], closeModal: () => void) {
    const escapeHtml = (text: string) => {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };

    modal.querySelector('.modal-content')!.innerHTML = `
      <div class="welcome-selector">
        <h2>Select Bluesky Post</h2>
        <p>Choose a post to add to your garden</p>
        <div class="post-list">
          ${posts.map((post) => {
            const uri = post.uri || '';
            const val = post.value as any;
            const text = val?.text?.slice(0, 200) || 'Post';
            const createdAt = val?.createdAt ? new Date(val.createdAt).toLocaleDateString() : '';
            return `
              <button class="post-item-selectable" data-uri="${uri}">
                <div class="post-content">
                  <p class="post-text">${escapeHtml(text)}${text.length >= 200 ? '...' : ''}</p>
                  ${createdAt ? `<time class="post-date">${createdAt}</time>` : ''}
                </div>
              </button>
            `;
          }).join('')}
        </div>
        <button class="button button-secondary modal-close">Cancel</button>
      </div>
    `;

    modal.querySelectorAll('.post-item-selectable').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uri = btn.getAttribute('data-uri');
        if (uri) {
          const { addSection } = await import('../config');
          addSection({ type: 'records', records: [uri], layout: 'post' });
          closeModal();
          this.render();
        }
      });
    });

    modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
  }

  async showRecordsLoader() {
    const did = getCurrentDid();
    if (!did) return;

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="welcome-loading"><div class="spinner"></div><p>Loading your collections...</p></div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    try {
      const { getCollections } = await import('../records/loader');
      const collections = await getCollections(did);

      if (collections.length === 0) {
        modal.querySelector('.modal-content')!.innerHTML = `
          <p>No collections found in your repository.</p>
          <button class="button modal-close">Close</button>
        `;
        modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
        return;
      }

      this.renderCollectionSelector(modal, collections, did, closeModal);
    } catch (error) {
      modal.querySelector('.modal-content')!.innerHTML = `
        <p>Failed to load collections. Please try again.</p>
        <button class="button modal-close">Close</button>
      `;
      modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
    }
  }

  private renderCollectionSelector(modal: HTMLElement, collections: string[], did: string, closeModal: () => void) {
    modal.querySelector('.modal-content')!.innerHTML = `
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
        <button class="button button-secondary modal-close">Cancel</button>
      </div>
    `;

    modal.querySelectorAll('.collection-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const collection = btn.getAttribute('data-collection');
        if (!collection) return;

        modal.querySelector('.modal-content')!.innerHTML = `
          <div class="welcome-loading"><div class="spinner"></div><p>Loading records from ${collection}...</p></div>
        `;

        try {
          const { getCollectionRecords } = await import('../records/loader');
          const records = await getCollectionRecords(did, collection, { limit: 20 });

          if (records.length === 0) {
            modal.querySelector('.modal-content')!.innerHTML = `
              <p>No records found in ${collection}.</p>
              <button class="button modal-close">Close</button>
            `;
            modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
            return;
          }

          this.renderRecordSelector(modal, collection, records, closeModal);
        } catch (error) {
          modal.querySelector('.modal-content')!.innerHTML = `
            <p>Failed to load records from ${collection}. Please try again.</p>
            <button class="button modal-close">Close</button>
          `;
          modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
        }
      });
    });

    modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
  }

  private renderRecordSelector(modal: HTMLElement, collection: string, records: any[], closeModal: () => void) {
    modal.querySelector('.modal-content')!.innerHTML = `
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
                <span class="record-title">${this.escapeHtml(title)}</span>
              </label>
            `;
          }).join('')}
        </div>
        <div class="selector-actions">
          <button class="button" data-action="add-records">Add Selected</button>
          <button class="button button-secondary modal-close">Cancel</button>
        </div>
      </div>
    `;

    modal.querySelector('[data-action="add-records"]')?.addEventListener('click', async () => {
      const selected = Array.from(modal.querySelectorAll<HTMLInputElement>('.record-item input:checked'));

      if (selected.length === 0) {
        alert('Please select at least one record.');
        return;
      }

      const { addSection } = await import('../config');
      for (const input of selected) {
        const uri = input.getAttribute('data-uri');
        if (!uri) continue;

        addSection({
          type: 'records',
          records: [uri],
          layout: 'card'
        });
      }

      closeModal();
      this.render();
    });

    modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
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

    // If it's smoke-signal, show the smoke signal selection flow
    if (type === 'smoke-signal') {
      this.showSmokeSignalSelector();
      return;
    }

    // If it's leaflet, create a records section with leaflet layout
    if (type === 'leaflet') {
      this.showLeafletSelector();
      return;
    }

    // If it's profile, check for existing or clone from Bluesky
    if (type === 'profile') {
      this.addProfileSection();
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

  async addProfileSection() {
    const ownerDid = getSiteOwnerDid();
    if (!ownerDid) {
      this.showNotification('You must be logged in to add a profile.', 'error');
      return;
    }

    this.showNotification('Checking for existing profile...', 'success');

    try {
      // 1. Check if profile record already exists
      try {
        const existing = await getRecord(ownerDid, 'garden.spores.site.profile', 'self');
        if (existing && existing.value) {
          this.showNotification('Found existing profile.', 'success');
          this.addSectionToConfig({
            type: 'profile',
            collection: 'garden.spores.site.profile',
            rkey: 'self'
          });
          return;
        }
      } catch (e) {
        // Ignore error, proceed to creation
      }

      // 2. Clone from Bluesky
      this.showNotification('Importing profile from Bluesky...', 'success');
      const bskyProfile = await getProfile(ownerDid);

      if (!bskyProfile) {
        throw new Error('Could not fetch Bluesky profile');
      }

      const record: any = {
        $type: 'garden.spores.site.profile',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        displayName: bskyProfile.displayName,
        description: bskyProfile.description
      };

      // Handle Avatar (clone blob)
      if (bskyProfile.avatar) {
        try {
          const response = await fetch(bskyProfile.avatar);
          if (response.ok) {
            const blob = await response.blob();
            const upload = await uploadBlob(blob, blob.type);
            if (upload && upload.data && upload.data.blob) {
              record.avatar = upload.data.blob;
            }
          }
        } catch (e) {
          console.warn('Failed to clone avatar:', e);
        }
      }

      // Handle Banner (clone blob)
      if (bskyProfile.banner) {
        try {
          const response = await fetch(bskyProfile.banner);
          if (response.ok) {
            const blob = await response.blob();
            const upload = await uploadBlob(blob, blob.type);
            if (upload && upload.data && upload.data.blob) {
              record.banner = upload.data.blob;
            }
          }
        } catch (e) {
          console.warn('Failed to clone banner:', e);
        }
      }

      // 3. Create the record
      await putRecord('garden.spores.site.profile', 'self', record);

      this.showNotification('Profile imported successfully!', 'success');

      // 4. Add the section
      this.addSectionToConfig({
        type: 'profile',
        collection: 'garden.spores.site.profile',
        rkey: 'self'
      });

    } catch (error) {
      console.error('Failed to add profile section:', error);
      this.showNotification('Failed to import profile. Using default view.', 'error');

      // Fallback: Add section without specific record binding
      this.addSectionToConfig({
        type: 'profile'
      });
    }
  }

  addSectionToConfig(params: { type: string, collection?: string, rkey?: string, title?: string }) {
    const config = getConfig();
    const id = `section-${Date.now()}`;

    const section: any = {
      id,
      type: params.type,
      layout: params.type === 'profile' ? 'profile' : 'card',
    };

    if (params.type === 'flower-bed') {
      section.layout = 'flower-bed';
      section.title = 'Flower Bed';
    } else if (params.type === 'collected-flowers') {
      section.layout = 'collected-flowers';
      section.title = 'Collected Flowers';
    } else if (params.type === 'special-spore-display') {
      section.layout = 'special-spore-display';
      section.title = 'Special Spore';
    }

    if (params.collection) section.collection = params.collection;
    if (params.rkey) section.rkey = params.rkey;
    if (params.title) section.title = params.title;

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

      // Update button state directly without re-rendering the whole page (to avoid flicker)
      const btn = this.querySelector('.plant-flower-btn') as HTMLButtonElement;
      if (btn) {
        btn.textContent = 'Already planted';
        btn.disabled = true;
        btn.setAttribute('aria-label', 'You have already planted a flower in this garden');
        btn.title = 'You have already planted a flower in this garden';
      }

      // Refresh only the flower bed sections
      const sections = this.querySelectorAll('section-block');
      sections.forEach(section => {
        // Access existing section type - need to check if we can access the data
        if (section.getAttribute('data-type') === 'flower-bed') {
          // Force re-render of just this section
          (section as any).render();
        }
      });
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

    // Show share modal with preview
    this.showShareModal(currentDid);
  }

  async showShareModal(currentDid: string) {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal share-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 800px;">
        <h2>Share on Bluesky</h2>
        <div class="share-modal-body">
          <div class="share-preview-loading">
            <div class="loading-spinner"></div>
            <p>Generating social card preview...</p>
          </div>
        </div>
        <div class="modal-actions">
          <button class="button button-primary share-confirm-btn" disabled>Share on Bluesky</button>
          <button class="button button-secondary modal-close">Cancel</button>
        </div>
      </div>
    `;

    const modalBody = modal.querySelector('.share-modal-body') as HTMLElement;
    const confirmBtn = modal.querySelector('.share-confirm-btn') as HTMLButtonElement;
    const closeBtn = modal.querySelector('.modal-close') as HTMLButtonElement;

    // Close handlers
    closeBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);

    // Variables to store generated data for posting
    let imageBlob: Blob | null = null;
    let dataUrl: string | null = null;

    try {
      // Generate social card
      imageBlob = await generateSocialCardImage();

      // Convert blob to data URL for preview
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageBlob!);
      });

      // Show preview
      modalBody.innerHTML = `
        <div class="share-preview">
          <img src="${dataUrl}" alt="Social card preview">
          <p class="share-preview-hint">
            This card will be posted to your Bluesky feed along with a link to your garden.
          </p>
        </div>
      `;

      // Enable confirm button
      confirmBtn.disabled = false;

    } catch (error) {
      console.error('Failed to generate social card preview:', error);
      modalBody.innerHTML = `
        <div class="share-error">
          <p style="color: var(--error-color);">Failed to generate preview: ${this.escapeHtml(error.message)}</p>
        </div>
      `;
      return;
    }

    // Handle confirm button click
    confirmBtn.addEventListener('click', async () => {
      if (!imageBlob) return;

      // Show posting state
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Posting...';
      closeBtn.disabled = true;

      try {
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
        const result = await post(postRecord) as { uri: string; cid: string };

        // 4. Show success with post URL
        // AT Protocol URI format: at://did/app.bsky.feed.post/rkey
        // Convert to Bluesky web URL: https://bsky.app/profile/did/post/rkey
        const uri = result.uri;
        const uriParts = uri.replace('at://', '').split('/');
        const postDid = uriParts[0];
        const postRkey = uriParts[2];
        const postUrl = `https://bsky.app/profile/${postDid}/post/${postRkey}`;

        modalBody.innerHTML = `
          <div class="share-success">
            <div style="text-align: center; padding: var(--spacing-lg);">
              <div style="font-size: 3em; margin-bottom: var(--spacing-md);">🎉</div>
              <h3 style="margin-bottom: var(--spacing-md);">Successfully shared!</h3>
              <p style="margin-bottom: var(--spacing-lg);">Your garden has been shared to Bluesky.</p>
              <a href="${postUrl}" target="_blank" rel="noopener noreferrer" class="button button-primary" style="display: inline-block; text-decoration: none;">
                View Post on Bluesky →
              </a>
            </div>
          </div>
        `;

        // Update modal actions
        const actionsDiv = modal.querySelector('.modal-actions') as HTMLElement;
        actionsDiv.innerHTML = `
          <button class="button button-secondary modal-close">Close</button>
        `;
        actionsDiv.querySelector('.modal-close')?.addEventListener('click', () => modal.remove());

      } catch (error) {
        console.error('Failed to share to Bluesky:', error);
        modalBody.innerHTML = `
          <div class="share-error">
            <p style="color: var(--error-color);">Failed to share: ${this.escapeHtml(error.message)}</p>
          </div>
        `;
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Try Again';
        closeBtn.disabled = false;
      }
    });
  }

  async showSmokeSignalSelector() {
    const currentDid = getCurrentDid();
    if (!currentDid) {
      alert('Please log in to add Smoke Signal events.');
      return;
    }

    // Step 1: Show organizing vs attending selector
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Add Smoke Signal Events</h2>
        <p>What type of events would you like to display?</p>
        <div class="smoke-signal-type-selector" style="display: flex; flex-direction: row; gap: 1rem; margin: 1.5rem 0;">
          <button data-event-type="organizing" class="section-type" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1.5rem 1rem; min-height: 100px;">
            <span class="icon" style="font-size: 2rem; margin-bottom: 0.5rem;">📅</span>
            <span style="font-weight: 500;">Organizing</span>
            <span style="font-size: 0.85em; color: var(--text-muted); margin-top: 0.25rem;">Events I'm hosting</span>
          </button>
          <button data-event-type="attending" class="section-type" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1.5rem 1rem; min-height: 100px;">
            <span class="icon" style="font-size: 2rem; margin-bottom: 0.5rem;">🎟️</span>
            <span style="font-weight: 500;">Attending</span>
            <span style="font-size: 0.85em; color: var(--text-muted); margin-top: 0.25rem;">Events I've RSVP'd to</span>
          </button>
        </div>
        <button class="button button-secondary modal-close" style="width: 100%;">Cancel</button>
      </div>
    `;

    modal.querySelectorAll('[data-event-type]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const eventType = (btn as HTMLElement).dataset.eventType;
        modal.remove();

        if (eventType === 'organizing') {
          await this.loadSmokeSignalRecords('community.lexicon.calendar.event', 'Events I\'m Organizing');
        } else if (eventType === 'attending') {
          await this.loadSmokeSignalRecords('community.lexicon.calendar.rsvp', 'Events I\'m Attending');
        }
      });
    });

    modal.querySelector('.modal-close')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
  }

  async loadSmokeSignalRecords(collection: string, sectionTitle: string) {
    const currentDid = getCurrentDid();
    if (!currentDid) return;

    // Show loading modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="welcome-loading">
          <div class="spinner"></div>
          <p>Loading ${collection === 'community.lexicon.calendar.event' ? 'events' : 'RSVPs'}...</p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    try {
      const { getCollectionRecords, getRecordByUri } = await import('../records/loader');
      const records = await getCollectionRecords(currentDid, collection, { limit: 50 });

      if (records.length === 0) {
        modal.innerHTML = `
          <div class="modal-content">
            <h2>No Records Found</h2>
            <p>You don't have any ${collection === 'community.lexicon.calendar.event' ? 'events' : 'RSVPs'} in your repository.</p>
            <p style="font-size: 0.9em; color: var(--text-muted);">
              Collection: <code>${collection}</code>
            </p>
            <button class="button button-secondary modal-close">Close</button>
          </div>
        `;
        modal.querySelector('.modal-close')?.addEventListener('click', () => modal.remove());
        return;
      }

      // For RSVPs, we need to fetch the event details to show meaningful names
      const isRsvp = collection === 'community.lexicon.calendar.rsvp';
      let enrichedRecords = records;

      if (isRsvp) {
        modal.innerHTML = `
          <div class="modal-content">
            <div class="welcome-loading">
              <div class="spinner"></div>
              <p>Loading event details...</p>
            </div>
          </div>
        `;

        // Fetch event details for each RSVP
        enrichedRecords = await Promise.all(records.map(async (record) => {
          const subjectUri = record.value?.subject?.uri;
          if (subjectUri) {
            try {
              const eventRecord = await getRecordByUri(subjectUri);
              return {
                ...record,
                _eventDetails: eventRecord?.value || null
              };
            } catch (e) {
              console.warn('Failed to fetch event for RSVP:', subjectUri, e);
              return { ...record, _eventDetails: null };
            }
          }
          return { ...record, _eventDetails: null };
        }));
      }

      // Show record selector
      this.showSmokeSignalRecordSelector(modal, enrichedRecords, collection, sectionTitle);
    } catch (error) {
      console.error('Failed to load smoke signal records:', error);
      modal.innerHTML = `
        <div class="modal-content">
          <h2>Error</h2>
          <p>Failed to load records: ${error instanceof Error ? error.message : 'Unknown error'}</p>
          <button class="button button-secondary modal-close">Close</button>
        </div>
      `;
      modal.querySelector('.modal-close')?.addEventListener('click', () => modal.remove());
    }
  }

  showSmokeSignalRecordSelector(modal: HTMLElement, records: any[], collection: string, sectionTitle: string) {
    const isEvent = collection === 'community.lexicon.calendar.event';

    modal.innerHTML = `
      <div class="modal-content">
        <h2>Select ${isEvent ? 'Events' : 'RSVPs'}</h2>
        <p>Choose which ${isEvent ? 'events' : 'RSVPs'} to display on your garden</p>
        <div class="record-list" style="max-height: 400px; overflow-y: auto; margin: 1rem 0;">
          ${records.map((record, idx) => {
      const rkey = record.uri?.split('/').pop() || idx.toString();
      const value = record.value || {};

      // For events: show name and date
      // For RSVPs: show status and event name (from enriched _eventDetails)
      let title = '';
      let subtitle = '';

      if (isEvent) {
        title = value.name || 'Untitled Event';
        if (value.startsAt) {
          try {
            subtitle = new Date(value.startsAt).toLocaleDateString();
          } catch {
            subtitle = value.startsAt;
          }
        }
      } else {
        // RSVP - show event name and status
        const eventDetails = record._eventDetails;
        const eventName = eventDetails?.name || 'Unknown Event';

        // Format RSVP status
        const status = value.status || 'going';
        const statusLabel = status.includes('#') ? status.split('#').pop() : status;
        const statusEmoji = statusLabel === 'going' ? '✓' : statusLabel === 'interested' ? '?' : '✗';

        title = eventName;
        subtitle = `${statusEmoji} ${statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)}`;

        // Add event date if available
        if (eventDetails?.startsAt) {
          try {
            subtitle += ` · ${new Date(eventDetails.startsAt).toLocaleDateString()}`;
          } catch {
            // ignore date parse error
          }
        }
      }

      return `
              <label class="record-item" style="display: flex; align-items: center; padding: 0.75rem; border: 1px solid var(--border); border-radius: 4px; margin-bottom: 0.5rem; cursor: pointer;">
                <input type="checkbox" value="${rkey}" data-uri="${record.uri || ''}" style="margin-right: 0.75rem;">
                <div>
                  <div style="font-weight: 500;">${this.escapeHtmlAttr(title)}</div>
                  ${subtitle ? `<div style="font-size: 0.85em; color: var(--text-muted);">${this.escapeHtmlAttr(subtitle)}</div>` : ''}
                </div>
              </label>
            `;
    }).join('')}
        </div>
        <div class="modal-actions" style="display: flex; gap: 0.5rem; justify-content: flex-end;">
          <button class="button button-primary" data-action="add-selected">Add Selected</button>
          <button class="button button-secondary modal-close">Cancel</button>
        </div>
      </div>
    `;

    modal.querySelector('[data-action="add-selected"]')?.addEventListener('click', () => {
      const selected = Array.from(modal.querySelectorAll<HTMLInputElement>('.record-item input:checked'));

      if (selected.length === 0) {
        alert('Please select at least one record.');
        return;
      }

      const uris = selected.map(input => input.getAttribute('data-uri')).filter(Boolean) as string[];

      // Add section with selected records
      const config = getConfig();
      const id = `section-${Date.now()}`;
      const section = {
        id,
        type: 'records',
        layout: 'smoke-signal',
        title: sectionTitle,
        records: uris
      };
      config.sections = [...(config.sections || []), section];

      modal.remove();
      this.render();
    });

    modal.querySelector('.modal-close')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  async showLeafletSelector() {
    const currentDid = getCurrentDid();
    if (!currentDid) return;

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="welcome-loading">
          <div class="spinner"></div>
          <p>Loading leaflet publications...</p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    try {
      const { getCollectionRecords } = await import('../records/loader');
      const collections = ['site.standard.document', 'pub.leaflet.document'];

      const recordSets = await Promise.all(collections.map(async (collection) => {
        try {
          const records = await getCollectionRecords(currentDid, collection, { limit: 50 });
          return records.map(record => ({ ...record, _collection: collection }));
        } catch (error) {
          console.warn(`Failed to load ${collection} records:`, error);
          return [];
        }
      }));

      const records = recordSets.flat();
      const seen = new Set<string>();
      const uniqueRecords = records.filter(record => {
        const key = record.uri || `${record._collection}:${record.cid || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (uniqueRecords.length === 0) {
        modal.innerHTML = `
          <div class="modal-content">
            <h2>No Publications Found</h2>
            <p>You don't have any leaflet publications yet.</p>
            <p style="font-size: 0.9em; color: var(--text-muted);">
              Collections checked: <code>site.standard.document</code>, <code>pub.leaflet.document</code>
            </p>
            <button class="button button-secondary modal-close">Close</button>
          </div>
        `;
        modal.querySelector('.modal-close')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
          if (e.target === modal) modal.remove();
        });
        return;
      }

      this.showLeafletRecordSelector(modal, uniqueRecords);
    } catch (error) {
      console.error('Failed to load leaflet records:', error);
      modal.innerHTML = `
        <div class="modal-content">
          <h2>Error</h2>
          <p>Failed to load leaflet records: ${error instanceof Error ? error.message : 'Unknown error'}</p>
          <button class="button button-secondary modal-close">Close</button>
        </div>
      `;
      modal.querySelector('.modal-close')?.addEventListener('click', () => modal.remove());
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });
    }
  }

  showLeafletRecordSelector(modal: HTMLElement, records: any[]) {
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Select Leaflet Publications</h2>
        <p>Choose which leaflet.pub articles to display on your garden</p>
        <div class="record-list" style="max-height: 400px; overflow-y: auto; margin: 1rem 0;">
          ${records.map((record, idx) => {
      const rkey = record.uri?.split('/').pop() || idx.toString();
      const value = record.value || {};
      const title = value.title || 'Untitled Article';
      let subtitle = '';
      if (value.publishedAt) {
        try {
          subtitle = new Date(value.publishedAt).toLocaleDateString();
        } catch {
          subtitle = value.publishedAt;
        }
      }
      return `
              <label class="record-item" style="display: flex; align-items: center; padding: 0.75rem; border: 1px solid var(--border); border-radius: 4px; margin-bottom: 0.5rem; cursor: pointer;">
                <input type="checkbox" value="${rkey}" data-uri="${record.uri || ''}" style="margin-right: 0.75rem;">
                <div>
                  <div style="font-weight: 500;">${this.escapeHtmlAttr(title)}</div>
                  ${subtitle ? `<div style="font-size: 0.85em; color: var(--text-muted);">${this.escapeHtmlAttr(subtitle)}</div>` : ''}
                </div>
              </label>
            `;
    }).join('')}
        </div>
        <div class="modal-actions" style="display: flex; gap: 0.5rem; justify-content: flex-end;">
          <button class="button button-primary" data-action="add-selected">Add Selected</button>
          <button class="button button-secondary modal-close">Cancel</button>
        </div>
      </div>
    `;

    modal.querySelector('[data-action="add-selected"]')?.addEventListener('click', () => {
      const selected = Array.from(modal.querySelectorAll<HTMLInputElement>('.record-item input:checked'));

      if (selected.length === 0) {
        alert('Please select at least one publication.');
        return;
      }

      const uris = selected.map(input => input.getAttribute('data-uri')).filter(Boolean) as string[];
      if (uris.length === 0) {
        alert('Selected publications are missing URIs.');
        return;
      }

      const config = getConfig();
      const id = `section-${Date.now()}`;
      const section = {
        id,
        type: 'records',
        layout: 'leaflet',
        title: 'Leaflet Posts',
        records: uris
      };
      config.sections = [...(config.sections || []), section];

      modal.remove();
      this.render();
    });

    modal.querySelector('.modal-close')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  private escapeHtmlAttr(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
      const saveBtn = footer.querySelector('#config-save-btn') as HTMLButtonElement | null;
      saveBtn?.addEventListener('click', async () => {
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
   * Check if the current user is viewing their own garden
   * Returns true only if we're on a garden page AND it belongs to the given DID
   */
  private isViewingOwnGarden(userDid: string): boolean {
    if (!this.isViewingProfile()) {
      return false; // On home page, not viewing any garden
    }
    const ownerDid = getSiteOwnerDid();
    return ownerDid === userDid;
  }

  /**
   * Check if user has completed onboarding (localStorage backup)
   * This serves as a backup in case PDS check fails
   */
  private hasCompletedOnboarding(did: string): boolean {
    try {
      return localStorage.getItem(`spores.garden.hasCompletedOnboarding.${did}`) === 'true';
    } catch (error) {
      console.warn('Failed to check onboarding status from localStorage:', error);
      return false;
    }
  }

  /**
   * Mark user as having completed onboarding (localStorage backup)
   */
  private markOnboardingComplete(did: string): void {
    try {
      localStorage.setItem(`spores.garden.hasCompletedOnboarding.${did}`, 'true');
    } catch (error) {
      console.warn('Failed to save onboarding status to localStorage:', error);
    }
  }

  /**
   * Update the browser favicon based on the garden owner's DID.
   * This should only be called once when the garden loads, not for every flower.
   */
  private updateFavicon(did: string | null): void {
    let svgString: string;

    if (!did) {
      // On home page with no garden, use dandelion icon
      svgString = this.getDandelionFaviconSvg();
    } else {
      svgString = generateFlowerSVGString(did, 32);
    }

    const dataUri = `data:image/svg+xml;base64,${btoa(svgString)}`;

    let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
    if (link) {
      link.href = dataUri;
    } else {
      link = document.createElement('link');
      link.rel = 'icon';
      link.href = dataUri;
      document.head.appendChild(link);
    }
  }

  /**
   * Generate dandelion SVG for favicon (with explicit colors instead of currentColor)
   */
  private getDandelionFaviconSvg(): string {
    const color = '#4a7c59'; // Garden green color
    return `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 38 Q19 30 20 22" stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <circle cx="20" cy="12" r="3" fill="${color}"/>
      <g stroke="${color}" stroke-width="0.8" stroke-linecap="round">
        <line x1="20" y1="12" x2="20" y2="2"/>
        <circle cx="20" cy="1.5" r="1" fill="${color}"/>
        <line x1="20" y1="12" x2="27" y2="4"/>
        <circle cx="27.5" cy="3.5" r="1" fill="${color}"/>
        <line x1="20" y1="12" x2="30" y2="10"/>
        <circle cx="30.5" cy="10" r="1" fill="${color}"/>
        <line x1="20" y1="12" x2="28" y2="18"/>
        <circle cx="28.5" cy="18.5" r="1" fill="${color}"/>
        <line x1="20" y1="12" x2="13" y2="4"/>
        <circle cx="12.5" cy="3.5" r="1" fill="${color}"/>
        <line x1="20" y1="12" x2="10" y2="10"/>
        <circle cx="9.5" cy="10" r="1" fill="${color}"/>
        <line x1="20" y1="12" x2="12" y2="18"/>
        <circle cx="11.5" cy="18.5" r="1" fill="${color}"/>
        <line x1="20" y1="12" x2="24" y2="3"/>
        <circle cx="24.5" cy="2.5" r="0.8" fill="${color}"/>
        <line x1="20" y1="12" x2="16" y2="3"/>
        <circle cx="15.5" cy="2.5" r="0.8" fill="${color}"/>
        <line x1="20" y1="12" x2="29" y2="14"/>
        <circle cx="29.5" cy="14" r="0.8" fill="${color}"/>
        <line x1="20" y1="12" x2="11" y2="14"/>
        <circle cx="10.5" cy="14" r="0.8" fill="${color}"/>
      </g>
      <g transform="translate(32, 6)" opacity="0.6">
        <line x1="0" y1="3" x2="0" y2="0" stroke="${color}" stroke-width="0.5"/>
        <circle cx="0" cy="0" r="0.8" fill="${color}"/>
      </g>
    </svg>`;
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
      // 1. Check backlinks (cached/faster usually)
      const response = await getBacklinks(ownerDid, 'garden.spores.social.flower:subject', { limit: 100 });
      const plantedFlowers = response.records || response.links || [];
      const foundInBacklinks = plantedFlowers.some(flower => flower.did === currentDid);

      if (foundInBacklinks) return true;

      // 2. Check PDS directly (authoritative, handles indexer lag)
      const userFlowers = await listRecords(currentDid, 'garden.spores.social.flower', { limit: 50 });
      return userFlowers?.records?.some(r => r.value?.subject === ownerDid);
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

  /**
   * Get display name for a DID
   * First checks for custom spores.garden profile, then falls back to Bluesky profile
   */
  async getDisplayNameForDid(did: string): Promise<string | null> {
    try {
      // First, check for custom garden.spores.site.profile record with rkey 'self'
      const customProfile = await getRecord(did, 'garden.spores.site.profile', 'self');
      if (customProfile?.value?.displayName) {
        return customProfile.value.displayName;
      }

      // Fall back to Bluesky profile
      const bskyProfile = await getProfile(did);
      if (bskyProfile?.displayName) {
        return bskyProfile.displayName;
      }

      return null;
    } catch (error) {
      console.warn('Failed to get display name for DID:', error);
      return null;
    }
  }

  /**
   * Generate dandelion SVG icon for home button
   * A stylized dandelion that works as a recognizable home/brand icon
   */
  getDandelionIcon(): string {
    return `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" class="dandelion-icon">
      <!-- Stem -->
      <path d="M20 38 Q19 30 20 22" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <!-- Center seed head -->
      <circle cx="20" cy="12" r="3" fill="currentColor"/>
      <!-- Seed wisps radiating outward -->
      <g stroke="currentColor" stroke-width="0.8" stroke-linecap="round">
        <!-- Top -->
        <line x1="20" y1="12" x2="20" y2="2"/>
        <circle cx="20" cy="1.5" r="1" fill="currentColor"/>
        <!-- Top-right -->
        <line x1="20" y1="12" x2="27" y2="4"/>
        <circle cx="27.5" cy="3.5" r="1" fill="currentColor"/>
        <!-- Right -->
        <line x1="20" y1="12" x2="30" y2="10"/>
        <circle cx="30.5" cy="10" r="1" fill="currentColor"/>
        <!-- Bottom-right -->
        <line x1="20" y1="12" x2="28" y2="18"/>
        <circle cx="28.5" cy="18.5" r="1" fill="currentColor"/>
        <!-- Top-left -->
        <line x1="20" y1="12" x2="13" y2="4"/>
        <circle cx="12.5" cy="3.5" r="1" fill="currentColor"/>
        <!-- Left -->
        <line x1="20" y1="12" x2="10" y2="10"/>
        <circle cx="9.5" cy="10" r="1" fill="currentColor"/>
        <!-- Bottom-left -->
        <line x1="20" y1="12" x2="12" y2="18"/>
        <circle cx="11.5" cy="18.5" r="1" fill="currentColor"/>
        <!-- Additional wisps for fullness -->
        <line x1="20" y1="12" x2="24" y2="3"/>
        <circle cx="24.5" cy="2.5" r="0.8" fill="currentColor"/>
        <line x1="20" y1="12" x2="16" y2="3"/>
        <circle cx="15.5" cy="2.5" r="0.8" fill="currentColor"/>
        <line x1="20" y1="12" x2="29" y2="14"/>
        <circle cx="29.5" cy="14" r="0.8" fill="currentColor"/>
        <line x1="20" y1="12" x2="11" y2="14"/>
        <circle cx="10.5" cy="14" r="0.8" fill="currentColor"/>
      </g>
      <!-- Small floating seed (adds whimsy) -->
      <g transform="translate(32, 6)" opacity="0.6">
        <line x1="0" y1="3" x2="0" y2="0" stroke="currentColor" stroke-width="0.5"/>
        <circle cx="0" cy="0" r="0.8" fill="currentColor"/>
      </g>
    </svg>`;
  }
}

customElements.define('site-app', SiteApp);
