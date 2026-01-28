import { getConfig, getSiteOwnerDid, isOwner } from '../config';
import { isLoggedIn, getCurrentDid, logout } from '../oauth';
import { escapeHtml } from '../utils/sanitize';
import { SiteRouter } from './site-router';
import { generateFlowerSVGString, generateSporeFlowerSVGString } from '../utils/flower-svg';
import { showSporeDetailsModal } from './spore-modal';
import type { SiteAuth } from './site-auth';
import type { SiteEditor } from './site-editor';
import type { SiteInteractions } from './site-interactions';
import type { SiteData } from './site-data';
import './recent-gardens';
import './section-block';
import { findAllHeldSpores } from './spore-badge';

/**
 * Handles the main rendering logic for the site application.
 */
export class SiteRenderer {
    private app: HTMLElement;
    private auth: SiteAuth;
    private editor: SiteEditor;
    private interactions: SiteInteractions;
    private data: SiteData;
    private renderId = 0;

    constructor(
        app: HTMLElement,
        auth: SiteAuth,
        editor: SiteEditor,
        interactions: SiteInteractions,
        data: SiteData
    ) {
        this.app = app;
        this.auth = auth;
        this.editor = editor;
        this.interactions = interactions;
        this.data = data;
    }

    async render() {
        const myRenderId = ++this.renderId;
        const config = getConfig();
        const ownerDid = getSiteOwnerDid();
        const isOwnerLoggedIn = isOwner();
        const isHomePage = !SiteRouter.isViewingProfile();

        // Update favicon
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

        this.app.innerHTML = '';

        // Header with site title and controls
        const header = document.createElement('header');
        header.className = 'header';

        // Left group: home button + title/subtitle
        const leftGroup = document.createElement('div');
        leftGroup.className = 'header-left';
        leftGroup.style.display = 'flex';
        leftGroup.style.flexWrap = 'wrap';
        leftGroup.style.alignItems = 'center';
        leftGroup.style.gap = '1rem';

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

        // When in edit mode and owner is logged in, show editable inputs
        if (this.editor.editMode && isOwnerLoggedIn && !isHomePage) {
            // Editable title input
            const titleInput = document.createElement('input');
            titleInput.type = 'text';
            titleInput.className = 'site-title-input';
            titleInput.value = config.title || '';
            titleInput.placeholder = 'Site title';
            titleInput.maxLength = 100;
            titleInput.setAttribute('aria-label', 'Edit site title');
            titleInput.addEventListener('input', (e) => {
                const value = (e.target as HTMLInputElement).value;
                config.title = value;
            });
            titleContainer.appendChild(titleInput);

            // Editable subtitle input
            const subtitleInput = document.createElement('input');
            subtitleInput.type = 'text';
            subtitleInput.className = 'site-subtitle-input';
            subtitleInput.value = config.subtitle || '';
            subtitleInput.placeholder = 'Site subtitle';
            subtitleInput.maxLength = 200;
            subtitleInput.setAttribute('aria-label', 'Edit site subtitle');
            subtitleInput.addEventListener('input', (e) => {
                const value = (e.target as HTMLInputElement).value;
                config.subtitle = value;
            });
            titleContainer.appendChild(subtitleInput);
        } else {
            // Display mode - show static text
            const title = document.createElement('h1');
            title.className = 'site-title';
            title.textContent = displayTitle;
            titleContainer.appendChild(title);

            // Add subtitle as h2
            const subtitle = document.createElement('h2');
            subtitle.className = 'site-subtitle';
            subtitle.textContent = displaySubtitle;
            titleContainer.appendChild(subtitle);

            // Render Spores
            try {
                // We use findAllHeldSpores from spore-badge.ts
                // Note: The floating badge logic still exists at bottom, but we duplicate the *display* here for local user
                // The floating badge is for specific interactions (stealing), while this header one is for display/provenance.
                // However, the prompt says "Move the display... to the header".
                // If I render it here, I should make sure it looks good.

                if (ownerDid && !isHomePage) {
                    // Optimization: perform this check asynchronously and update DOM to avoid blocking render?
                    // However, for simplicity and ensuring it appears with header, we await it or allow it to pop in.
                    // Since render() is async, we can await it, but it might delay TTI.
                    // Let's fire it and append when ready to avoid blocking initial paint if possible, 
                    // but `render` is awaited by caller anyway.

                    findAllHeldSpores(ownerDid).then(spores => {
                        if (spores.length > 0) {
                            const sporesWrap = document.createElement('div');
                            sporesWrap.className = 'header-spores';
                            sporesWrap.style.display = 'flex';
                            sporesWrap.style.gap = '0.5rem';
                            // Zero margin top since it's now a sibling
                            sporesWrap.style.marginTop = '0';
                            sporesWrap.style.alignItems = 'center';

                            spores.forEach(spore => {
                                const sporeEl = document.createElement('div');
                                sporeEl.title = 'Special Spore';
                                sporeEl.style.cursor = 'pointer';
                                sporeEl.style.width = '60px';
                                sporeEl.style.height = '60px';
                                sporeEl.style.flexShrink = '0';
                                sporeEl.innerHTML = generateSporeFlowerSVGString(spore.originGardenDid, 60);

                                sporeEl.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    showSporeDetailsModal(spore.originGardenDid);
                                });

                                sporesWrap.appendChild(sporeEl);
                            });

                            leftGroup.appendChild(sporesWrap);
                        }
                    });
                }
            } catch (err) {
                console.error("Failed to load header spores", err);
            }
        }

        leftGroup.appendChild(titleContainer);
        header.appendChild(leftGroup);

        // Controls
        const controls = document.createElement('div');
        controls.className = 'controls';

        const isViewingProfile = SiteRouter.isViewingProfile();

        if (isLoggedIn()) {
            if (isOwnerLoggedIn && !isHomePage) {
                // Edit/Save mode toggle
                const editBtn = document.createElement('button');
                editBtn.className = this.editor.editMode ? 'button button-primary' : 'button button-secondary';
                editBtn.textContent = this.editor.editMode ? 'Save' : 'Edit';
                editBtn.setAttribute('aria-label', this.editor.editMode ? 'Save changes and exit edit mode' : 'Enter edit mode');
                editBtn.setAttribute('aria-pressed', this.editor.editMode.toString());
                editBtn.addEventListener('click', () => this.editor.editMode ? this.editor.saveAndExitEdit() : this.editor.toggleEditMode());
                controls.appendChild(editBtn);

                // Share on Bluesky button
                const shareBtn = document.createElement('button');
                shareBtn.className = 'button button-secondary';
                shareBtn.textContent = 'Share on Bluesky';
                shareBtn.setAttribute('aria-label', 'Share your garden to Bluesky');
                shareBtn.addEventListener('click', () => this.interactions.shareToBluesky());
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
                    this.interactions.checkHasPlantedFlower(ownerDid!, currentDid),
                    this.interactions.checkHasTakenSeed(currentDid, ownerDid!)
                ]);

                // Guard against race conditions
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
                    plantFlowerBtn.setAttribute('aria-label', 'Plant a flower in this garden');
                    plantFlowerBtn.title = 'Leave your unique flower in this garden as a way to show appreciation';
                    plantFlowerBtn.addEventListener('click', () => this.interactions.plantFlower());
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
                    takeFlowerBtn.classList.add('take-seed-btn');
                    takeFlowerBtn.addEventListener('click', () => this.interactions.takeFlower());
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
            // Login button
            const loginBtn = document.createElement('button');
            loginBtn.className = 'button';
            loginBtn.textContent = 'Login';
            loginBtn.setAttribute(
                'aria-label',
                isViewingProfile ? 'Log in to interact with this garden' : 'Log in with AT Protocol'
            );
            loginBtn.addEventListener('click', () => this.auth.showLoginModal());
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
        this.app.appendChild(header);

        // Main content
        const main = document.createElement('main');
        main.className = 'main';

        const sections = config.sections || [];

        if (isHomePage) {
            // Home page view
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
                loginBtn.addEventListener('click', () => this.auth.showLoginModal());
                homepageView.appendChild(loginBtn);
            } else {
                const currentDid = getCurrentDid();
                if (currentDid) {
                    const heading = document.createElement('h2');
                    heading.style.textAlign = 'center';
                    heading.textContent = 'Welcome back!';
                    homepageView.appendChild(heading);

                    this.data.getDisplayNameForDid(currentDid).then(displayName => {
                        if (displayName && this.renderId === myRenderId) {
                            heading.textContent = `Welcome back, ${displayName}!`;
                        }
                    });
                }
            }

            const recentGardens = document.createElement('recent-gardens');
            recentGardens.setAttribute('data-limit', '12');
            recentGardens.setAttribute('data-show-empty', 'true');
            recentGardens.style.marginTop = 'var(--spacing-xl)';
            recentGardens.style.textAlign = 'left';
            homepageView.appendChild(recentGardens);

            main.appendChild(homepageView);
        } else if (sections.length === 0 && !this.editor.editMode) {
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
                editButton.addEventListener('click', () => this.editor.toggleEditMode());
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
                sectionEl.setAttribute('data-edit-mode', this.editor.editMode.toString());

                sectionEl.addEventListener('share-to-bluesky', () => {
                    this.interactions.shareToBluesky();
                });

                main.appendChild(sectionEl);
            }
        }

        // Add section button in edit mode
        if (this.editor.editMode && !isHomePage) {
            const addBtn = document.createElement('button');
            addBtn.className = 'add-section';
            addBtn.textContent = '+ Add Section';
            addBtn.setAttribute('aria-label', 'Add a new section to your garden');
            addBtn.addEventListener('click', () => this.editor.showAddSectionModal());
            main.appendChild(addBtn);

            const saveBar = document.createElement('div');
            saveBar.className = 'save-bar';
            const saveBtn = document.createElement('button');
            saveBtn.className = 'button button-primary save-btn';
            saveBtn.textContent = 'Save Changes';
            saveBtn.setAttribute('aria-label', 'Save your changes and exit edit mode');
            saveBtn.addEventListener('click', () => this.editor.saveAndExitEdit());
            saveBar.appendChild(saveBtn);
            main.appendChild(saveBar);
        }

        this.app.appendChild(main);

        // Spore badge
        if (!isHomePage) {
            const existingBadge = document.querySelector('spore-badge');
            if (existingBadge) existingBadge.remove();

            const sporeBadge = document.createElement('spore-badge');
            document.body.appendChild(sporeBadge);
        }

        // Dev tool reset button
        const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (isLocalDev && isLoggedIn()) {
            const devResetBtn = document.createElement('button');
            devResetBtn.className = 'dev-reset-button';
            devResetBtn.textContent = 'Reset Garden Data';
            devResetBtn.setAttribute('aria-label', 'Delete all garden.spores.* localStorage and PDS records (dev only)');
            devResetBtn.title = 'Delete all garden.spores.* localStorage and PDS records';
            devResetBtn.addEventListener('click', () => this.data.resetGardenData());
            this.app.appendChild(devResetBtn);
        }
    }

    showNotification(message: string, type: 'success' | 'error' = 'success') {
        const existing = document.querySelector('.notification');
        if (existing) {
            existing.remove();
        }

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-message">${escapeHtml(message)}</span>
        <button class="notification-close" aria-label="Close">×</button>
      </div>
    `;

        notification.querySelector('.notification-close')?.addEventListener('click', () => {
            notification.remove();
        });

        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                setTimeout(() => notification.remove(), 200);
            }
        }, 3000);
    }

    getLoadingMessage(): string {
        if (SiteRouter.isViewingProfile()) {
            const messages = ['loading spores', 'loading garden'];
            return messages[Math.floor(Math.random() * messages.length)];
        }
        return 'Loading your garden...';
    }

    private updateFavicon(did: string | null): void {
        let svgString: string;

        if (!did) {
            svgString = this.getDandelionIcon();
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

    private getDandelionIcon(): string {
        const color = '#4a7c59';
        return `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" class="dandelion-icon">
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
}
