# Mobile Responsive Implementation Plan

This document outlines the complete plan for making spores.garden responsive and mobile-friendly.

## Current State

The app has limited responsive support with a single primary breakpoint at `640px`. The header controls overflow on small screens, and several components lack proper mobile optimization.

**Existing breakpoints:**
- `@media (max-width: 640px)` - Main mobile breakpoint
- `@media (max-width: 768px)` - Tablet (only used for recent-gardens)

**Current issues:**
- Header controls (up to 6 buttons) overflow on mobile
- No hamburger menu or collapsible controls
- Section controls overflow in edit mode
- Modal dialogs don't adapt well to mobile
- Touch targets may be too small
- Fixed widths don't scale down

---

## Breakpoint Strategy

We will use a mobile-first approach with three breakpoints:

| Breakpoint | Target | CSS |
|------------|--------|-----|
| Base | Mobile-first (< 480px) | Default styles |
| `480px` | Large mobile | `@media (min-width: 480px)` |
| `768px` | Tablet | `@media (min-width: 768px)` |
| `1024px` | Desktop | `@media (min-width: 1024px)` |

CSS variables to add:
```css
:root {
  --breakpoint-sm: 480px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
}
```

---

## Phase 1: Header Mobile Menu [COMPLETED]

**Goal:** Replace the horizontal control buttons with a collapsible mobile menu on small screens.

**Implementation Notes:**
- Added CSS breakpoint variables (`--breakpoint-sm`, `--breakpoint-md`, `--breakpoint-lg`) to `:root`
- Implemented hamburger menu toggle button that appears at `max-width: 767px`
- Controls transform into a slide-down drawer on mobile with smooth transition
- Toggle button switches between hamburger (☰) and X (✕) icons based on open state
- Click-outside handler closes the menu automatically
- All buttons in mobile menu get full width and 44px minimum height for touch targets
- Title and subtitle truncate with ellipsis on mobile to prevent overflow
- Updated viewport meta tag with `viewport-fit=cover` for notch support
- Extra small screen styles (< 480px) reduce title/subtitle sizes further

### 1.1 Mobile Menu Button (Hamburger)

Add a hamburger button that appears on mobile (< 768px):

```css
.mobile-menu-toggle {
  display: none;
  width: 44px;
  height: 44px;
  padding: var(--spacing-xs);
  background: transparent;
  border: var(--border-width) var(--border-style) var(--color-border);
  cursor: pointer;
}

.mobile-menu-toggle svg {
  width: 24px;
  height: 24px;
}

@media (max-width: 767px) {
  .mobile-menu-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .controls {
    display: none;
  }
  
  .controls.open {
    display: flex;
  }
}
```

### 1.2 Mobile Menu Drawer

Transform `.controls` into a slide-down drawer on mobile:

```css
@media (max-width: 767px) {
  .controls {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    flex-direction: column;
    background: var(--color-surface);
    border: var(--border-width) var(--border-style) var(--color-border);
    border-top: none;
    padding: var(--spacing-md);
    gap: var(--spacing-sm);
    z-index: 100;
    transform: translateY(-100%);
    opacity: 0;
    pointer-events: none;
    transition: transform 200ms ease, opacity 200ms ease;
  }
  
  .controls.open {
    transform: translateY(0);
    opacity: 1;
    pointer-events: auto;
  }
  
  .controls .button {
    width: 100%;
    justify-content: center;
    min-height: 44px;
  }
}
```

### 1.3 Header Layout Changes

Update header structure:

```css
.header {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md) var(--spacing-lg);
  gap: var(--spacing-md);
}

@media (max-width: 767px) {
  .header {
    padding: var(--spacing-sm) var(--spacing-md);
    flex-wrap: wrap;
  }
  
  .header-left {
    flex: 1;
    min-width: 0; /* Allow text truncation */
  }
  
  .site-title {
    font-size: 1.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .site-subtitle {
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

@media (max-width: 479px) {
  .site-title {
    font-size: 1.1rem;
  }
  
  .site-subtitle {
    font-size: 0.75rem;
  }
  
  .home-button {
    width: 36px;
    height: 36px;
  }
}
```

### 1.4 JavaScript Changes (`src/components/site-app.ts`)

Add mobile menu toggle functionality:

```typescript
// After creating controls div (line ~222)
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

menuToggle.addEventListener('click', () => {
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
document.addEventListener('click', (e) => {
  if (!header.contains(e.target as Node) && controls.classList.contains('open')) {
    controls.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    // Reset to hamburger icon
  }
});

// Insert toggle before controls in header
header.appendChild(menuToggle);
header.appendChild(controls);
```

---

## Phase 2: Section Controls [COMPLETED]

**Implementation Notes:**
- Updated `.section-header` base styles to use `align-items: flex-start`, `gap: var(--spacing-md)`, and `flex-wrap: wrap`
- Added mobile media query (max-width: 767px) that stacks section header vertically with full-width controls
- Section controls wrap into a responsive grid with 50% width buttons on tablet and 100% width on small mobile
- Move buttons get full width and centered alignment on mobile
- Added extra small screen styles (max-width: 479px) that collapse section info to full width with larger font size
- All buttons maintain 44px minimum height for proper touch targets

### 2.1 Section Header Mobile Layout

Update `.section-header` and `.section-controls` for mobile:

```css
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-md);
  flex-wrap: wrap;
}

@media (max-width: 767px) {
  .section-header {
    flex-direction: column;
    align-items: stretch;
  }
  
  .section-title-wrapper {
    width: 100%;
  }
  
  .section-controls {
    width: 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
  }
  
  .section-controls .button {
    flex: 1 1 calc(50% - var(--spacing-xs));
    min-width: 120px;
    min-height: 44px;
  }
  
  .section-move-buttons {
    width: 100%;
    justify-content: center;
  }
}
```

### 2.2 Section Info Collapse

Make section info (layout type, item count) collapsible on mobile:

```css
@media (max-width: 479px) {
  .section-info {
    width: 100%;
    margin-bottom: var(--spacing-xs);
    font-size: 0.75rem;
  }
}
```

---

## Phase 3: Layout Components [COMPLETED]

**Implementation Notes:**
- Added mobile responsive styles (max-width: 479px) for all four layout components
- Card Layout: Reduced padding to `--spacing-sm`, body padding to `--spacing-md`, title to 1rem, content to 0.9rem
- Profile Layout: Reduced padding, banner height to 120px, avatar to 60px, adjusted overlap margin for banner+body
- Post Layout: Reduced padding to `--spacing-sm`, title to 1.25rem, changed `.post-images-two` to single column, made meta and tags wrap
- Link Layout: Changed to column direction, made image full-width with 16:9 aspect ratio, reduced body padding
- All changes preserve the brutalist design aesthetic

### 3.1 Card Layout (`layout-card`)

```css
.layout-card {
  display: flex;
  flex-direction: column;
  padding: var(--spacing-md);
}

@media (max-width: 479px) {
  .layout-card {
    padding: var(--spacing-sm);
  }
  
  .card-title {
    font-size: 1rem;
  }
  
  .card-content {
    font-size: 0.9rem;
  }
}
```

### 3.2 Link Layout (`layout-link`)

Stack image and text on mobile:

```css
@media (max-width: 479px) {
  .layout-link {
    flex-direction: column;
  }
  
  .link-image {
    width: 100%;
    max-width: none;
    height: auto;
    aspect-ratio: 16/9;
  }
  
  .link-body {
    padding: var(--spacing-sm);
  }
}
```

### 3.3 Post Layout (`layout-post`)

```css
@media (max-width: 479px) {
  .layout-post {
    padding: var(--spacing-sm);
  }
  
  .post-images-two {
    grid-template-columns: 1fr;
  }
  
  .post-meta {
    flex-wrap: wrap;
    gap: var(--spacing-xs);
  }
}
```

### 3.4 Profile Layout (`layout-profile`)

```css
@media (max-width: 479px) {
  .layout-profile {
    padding: var(--spacing-sm);
  }
  
  .profile-banner {
    height: 120px;
  }
  
  .profile-avatar {
    width: 80px;
    height: 80px;
  }
}
```

---

## Phase 4: Grid Systems [COMPLETED]

**Implementation Notes:**
- Updated `.record-grid` to mobile-first approach: single column on mobile, then progressive enhancement at 480px (300px min), 768px (350px min), and 1024px (400px min)
- Updated `.flower-grid` to mobile-first: 3 fixed columns on mobile with small gap, then auto-fill at 480px (100px min) and 768px (120px min)
- Updated `.image-gallery` to mobile-first: 2 fixed columns on mobile with small gap, then auto-fit at 480px (150px min) and 768px (200px min)
- Removed conflicting `.record-grid` rule from legacy `@media (max-width: 640px)` block
- All grids now use appropriate gaps that scale with screen size (--spacing-sm on mobile, --spacing-md/--spacing-lg on larger screens)

### 4.1 Record Grid

```css
.record-grid {
  display: grid;
  gap: var(--spacing-lg);
  grid-template-columns: 1fr;
}

@media (min-width: 480px) {
  .record-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  }
}

@media (min-width: 768px) {
  .record-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 350px), 1fr));
    gap: var(--spacing-lg);
  }
}

@media (min-width: 1024px) {
  .record-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr));
  }
}
```

### 4.2 Flower Grid

```css
.flower-grid {
  display: grid;
  gap: var(--spacing-sm);
  grid-template-columns: repeat(3, 1fr);
}

@media (min-width: 480px) {
  .flower-grid {
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: var(--spacing-md);
  }
}

@media (min-width: 768px) {
  .flower-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }
}
```

### 4.3 Image Gallery

```css
.image-gallery {
  display: grid;
  gap: var(--spacing-sm);
  grid-template-columns: repeat(2, 1fr);
}

@media (min-width: 480px) {
  .image-gallery {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
}

@media (min-width: 768px) {
  .image-gallery {
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--spacing-md);
  }
}
```

---

## Phase 5: Modals [COMPLETED]

**Implementation Notes:**
- Added mobile bottom sheet style for modals (< 480px) - modals slide up from bottom with no side/bottom borders
- Implemented sticky header/footer for modal content with proper z-index and borders
- Added `.modal-overlay` class as an alias for `.modal` for flexibility
- Login modal inputs use 16px font size to prevent iOS zoom on focus
- Config modal responsive: single-column theme colors, wrapping config tabs at 50% width
- Welcome modal adapts to bottom sheet with reduced padding and single-column action cards
- Confirm modal maintains side-by-side buttons on mobile for better UX
- Create content/block modals get single-column section type grids
- All modal action buttons get 100% width and 44px min height for proper touch targets

### 5.1 Modal Container

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-md);
  z-index: 1000;
}

.modal-content {
  background: var(--color-background);
  border: var(--border-width) var(--border-style) var(--color-border);
  width: 100%;
  max-width: 600px;
  max-height: calc(100vh - var(--spacing-xl));
  overflow-y: auto;
}

@media (max-width: 479px) {
  .modal-overlay {
    padding: 0;
    align-items: flex-end;
  }
  
  .modal-content {
    max-width: none;
    max-height: 90vh;
    border-left: none;
    border-right: none;
    border-bottom: none;
    border-radius: 0;
  }
  
  .modal-header {
    position: sticky;
    top: 0;
    background: var(--color-background);
    border-bottom: var(--border-width) var(--border-style) var(--color-border);
    padding: var(--spacing-md);
    z-index: 1;
  }
  
  .modal-body {
    padding: var(--spacing-md);
  }
  
  .modal-footer {
    position: sticky;
    bottom: 0;
    background: var(--color-background);
    border-top: var(--border-width) var(--border-style) var(--color-border);
    padding: var(--spacing-md);
  }
}
```

### 5.2 Login Modal

```css
@media (max-width: 479px) {
  .login-modal .modal-content {
    padding: var(--spacing-md);
  }
  
  .login-modal input {
    font-size: 16px; /* Prevents iOS zoom */
  }
}
```

### 5.3 Config Modal

```css
@media (max-width: 479px) {
  .site-config {
    margin: 0;
    padding: var(--spacing-sm);
  }
  
  .theme-colors {
    grid-template-columns: 1fr;
  }
  
  .config-tabs {
    flex-wrap: wrap;
  }
  
  .config-tab {
    flex: 1 1 calc(50% - var(--spacing-xs));
    min-width: 0;
    text-align: center;
  }
}
```

---

## Phase 6: Touch Targets & Interactions [COMPLETED]

**Implementation Notes:**
- Added safe area inset CSS variables (`--safe-area-inset-top`, `--safe-area-inset-bottom`, `--safe-area-inset-left`, `--safe-area-inset-right`) to `:root` using `env()` with fallbacks
- Applied safe area insets to `.header` padding (top, left, right) for notch support
- Applied safe area insets to `.save-bar` positioning (bottom, right)
- Applied safe area insets to `.dev-reset-button` positioning (bottom, left)
- Applied safe area insets to `.notification` positioning on mobile (bottom, left, right)
- Added minimum touch target sizes (44x44px) for `.button`, `.mobile-menu-toggle`, `.section-move-btn`, and `.flower-item`
- Added mobile-specific touch target rules with 44px min-height for buttons
- Added smaller touch target (36px) for `.button-small` variant
- Added webkit tap highlight color for interactive elements on mobile (buttons, links, flower items, cards, etc.)
- Added min-height: 44px for `.links-item` and `.recent-garden-row-link` on mobile
- Improved touch targets for `.modal-close` and `.notification-close` buttons (44x44px with flex centering)

### 6.1 Minimum Touch Target Size

Ensure all interactive elements meet 44x44px minimum:

```css
.button,
.mobile-menu-toggle,
.section-move-btn,
.flower-item,
a[href] {
  min-height: 44px;
  min-width: 44px;
}

@media (max-width: 767px) {
  .button {
    padding: var(--spacing-sm) var(--spacing-md);
    min-height: 44px;
  }
  
  .button-small {
    min-height: 36px;
    padding: var(--spacing-xs) var(--spacing-sm);
  }
}
```

### 6.2 Tap Highlight

```css
@media (max-width: 767px) {
  .button,
  a,
  .flower-item,
  .recent-garden-row-link {
    -webkit-tap-highlight-color: rgba(var(--color-primary-rgb), 0.2);
  }
}
```

### 6.3 Safe Area Insets (Notch Support)

```css
:root {
  --safe-area-inset-top: env(safe-area-inset-top, 0px);
  --safe-area-inset-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-inset-left: env(safe-area-inset-left, 0px);
  --safe-area-inset-right: env(safe-area-inset-right, 0px);
}

.header {
  padding-top: calc(var(--spacing-md) + var(--safe-area-inset-top));
  padding-left: calc(var(--spacing-lg) + var(--safe-area-inset-left));
  padding-right: calc(var(--spacing-lg) + var(--safe-area-inset-right));
}

.save-bar {
  padding-bottom: calc(var(--spacing-md) + var(--safe-area-inset-bottom));
}
```

---

## Phase 7: Typography Scaling [COMPLETED]

**Implementation Notes:**
- Added fluid typography CSS custom properties to `:root` using `clamp()` for responsive scaling
- `--font-size-base`: clamp(0.875rem, 2.5vw, 1rem) - base body text
- `--font-size-sm`: clamp(0.75rem, 2vw, 0.875rem) - small text
- `--font-size-lg`: clamp(1rem, 3vw, 1.25rem) - section titles
- `--font-size-xl`: clamp(1.25rem, 4vw, 1.75rem) - site title, h2
- `--font-size-2xl`: clamp(1.5rem, 5vw, 2.5rem) - h1
- Updated body font-size to use `--font-size-base`
- Updated h1, h2, h3 headings to use the new variables
- Updated `.site-title` to use `--font-size-xl`
- Updated `.section-title` to use `--font-size-lg`
- Added line length control (`max-width: 65ch`) for `.layout-post .post-content`, `.layout-card .card-content`, and `.modal-body p`
- Mobile override (< 480px) removes max-width constraint for content areas

### 7.1 Fluid Typography

```css
:root {
  --font-size-base: clamp(0.875rem, 2.5vw, 1rem);
  --font-size-sm: clamp(0.75rem, 2vw, 0.875rem);
  --font-size-lg: clamp(1rem, 3vw, 1.25rem);
  --font-size-xl: clamp(1.25rem, 4vw, 1.75rem);
  --font-size-2xl: clamp(1.5rem, 5vw, 2.5rem);
}

body {
  font-size: var(--font-size-base);
}

.site-title {
  font-size: var(--font-size-xl);
}

.section-title {
  font-size: var(--font-size-lg);
}

h1 { font-size: var(--font-size-2xl); }
h2 { font-size: var(--font-size-xl); }
h3 { font-size: var(--font-size-lg); }
```

### 7.2 Line Length Control

```css
.layout-post .post-content,
.layout-card .card-content,
.modal-body p {
  max-width: 65ch;
}

@media (max-width: 479px) {
  .layout-post .post-content,
  .layout-card .card-content {
    max-width: none;
  }
}
```

---

## Phase 8: Save Bar & Notifications [COMPLETED]

**Implementation Notes:**
- Updated `.save-bar` to mobile-first approach: full-width bottom bar on mobile with safe area insets for padding
- Desktop (min-width: 768px): floating save bar in bottom-right corner with border
- Save button now has 44px minimum height for proper touch targets
- Updated `.notification` to mobile-first: full-width with safe area insets on mobile
- Desktop (min-width: 480px): constrained to max-width: 400px and right-aligned
- Removed conflicting notification styles from legacy `@media (max-width: 640px)` block
- Both components properly account for save bar height (80px offset)

### 8.1 Save Bar

```css
.save-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: var(--spacing-md);
  padding-bottom: calc(var(--spacing-md) + var(--safe-area-inset-bottom));
  background: var(--color-surface);
  border-top: var(--border-width) var(--border-style) var(--color-border);
  display: flex;
  justify-content: center;
  gap: var(--spacing-md);
  z-index: 50;
}

@media (min-width: 768px) {
  .save-bar {
    position: fixed;
    bottom: var(--spacing-lg);
    right: var(--spacing-lg);
    left: auto;
    border: var(--border-width) var(--border-style) var(--color-border);
    padding: var(--spacing-md);
  }
}
```

### 8.2 Notifications

```css
.notification {
  position: fixed;
  bottom: var(--spacing-md);
  right: var(--spacing-md);
  left: var(--spacing-md);
  z-index: 200;
}

@media (min-width: 480px) {
  .notification {
    left: auto;
    max-width: 400px;
  }
}
```

---

## Phase 9: Specific Components [COMPLETED]

**Implementation Notes:**
- Added extra small screen styles (max-width: 479px) for Recent Gardens: negative margin to extend list full width, reduced padding and gap, smaller flower visualization (32px), and adjusted font sizes
- Added DID Visualization mobile styles: max-width 200px with centered margin for better mobile display
- Added Flower Bed mobile styles: column layout for header, reduced modal padding, and constrained modal content width (280px)
- All changes preserve the brutalist design aesthetic and maintain proper touch targets

### 9.1 Recent Gardens

```css
@media (max-width: 479px) {
  .recent-gardens-list {
    margin: 0 calc(-1 * var(--spacing-md));
  }
  
  .recent-garden-row-link {
    padding: var(--spacing-sm);
    gap: var(--spacing-sm);
  }
  
  .recent-garden-flower {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
  }
  
  .recent-garden-display-name {
    font-size: 0.9rem;
  }
  
  .recent-garden-handle {
    font-size: 0.75rem;
  }
}
```

### 9.2 DID Visualization

```css
@media (max-width: 479px) {
  .did-visualization {
    max-width: 200px;
    margin: 0 auto;
  }
}
```

### 9.3 Flower Bed

```css
@media (max-width: 479px) {
  .flower-bed-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }
  
  .flower-modal {
    padding: var(--spacing-md);
  }
  
  .flower-modal-content {
    max-width: 280px;
  }
}
```

---

## Phase 10: Homepage [COMPLETED]

**Implementation Notes:**
- Added mobile responsive styles (max-width: 479px) for `.homepage-view`
- Reduced padding from `--spacing-xl` to `--spacing-md` on extra small screens
- Applied fluid typography `--font-size-lg` to homepage heading for better scaling
- Preserved text-align center for consistent mobile layout

```css
@media (max-width: 479px) {
  .homepage-view {
    padding: var(--spacing-md);
    text-align: center;
  }
  
  .homepage-view h2 {
    font-size: var(--font-size-lg);
  }
}
```

---

## Implementation Checklist

### Files to Modify

1. **`src/themes/base.css`** - All CSS changes
2. **`src/components/site-app.ts`** - Mobile menu toggle logic
3. **`src/components/section-block.ts`** - Section controls responsive behavior
4. **`index.html`** - Add viewport meta if missing

### Viewport Meta Tag

Ensure `index.html` has:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

### Testing Checklist

- [ ] Header menu toggle works
- [ ] Menu closes when clicking outside
- [ ] All buttons meet 44px touch target
- [ ] Text is readable without zooming
- [ ] Forms don't trigger iOS zoom (16px min font)
- [ ] Modals are usable on mobile
- [ ] Save bar doesn't overlap content
- [ ] Safe area insets work on notched devices
- [ ] Landscape orientation works
- [ ] Grid layouts adapt properly
- [ ] Section controls are usable in edit mode

### Test Devices/Viewports

- iPhone SE (375px)
- iPhone 14 (390px)
- iPhone 14 Pro Max (430px)
- iPad Mini (768px)
- iPad Pro (1024px)
- Android phone (360px typical)

---

## Summary

This plan covers:

1. **Header** - Collapsible mobile menu with hamburger toggle
2. **Section controls** - Responsive wrapping and stacking
3. **Layouts** - Mobile-optimized card, link, post, profile layouts
4. **Grids** - Mobile-first responsive grid systems
5. **Modals** - Bottom sheet style on mobile
6. **Touch** - 44px targets, tap highlights, safe areas
7. **Typography** - Fluid scaling with clamp()
8. **UI elements** - Save bar, notifications, recent gardens

The implementation follows mobile-first principles, using `min-width` breakpoints for progressive enhancement rather than `max-width` for graceful degradation.
