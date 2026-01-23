import { renderFlowerBed } from '../layouts/flower-bed';
import { renderCollectedFlowers } from '../layouts/collected-flowers';
import { renderSpecialSporeDisplay } from './special-spore-display';
import { renderImage } from './image';
import { renderSmokeSignal } from './smoke-signal';
import { renderLeaflet } from './leaflet';
import { extractFields } from '../records/field-extractor';
import { getConfig } from '../config';
import { generateThemeFromDid } from '../themes/engine';
import { buildAtUri, parseAtUri, getProfile } from '../at-client';
import { getCurrentDid } from '../oauth';
import { renderMarkdown, looksLikeMarkdown } from '../utils/markdown';
import { sanitizeHtml, escapeHtml } from '../utils/sanitize';


// Layout implementations
const layouts = new Map();

/**
 * Register a layout
 */
export function registerLayout(name, renderFn) {
  layouts.set(name, renderFn);
}

/**
 * Get a layout by name
 */
export function getLayout(name) {
  return layouts.get(name) || layouts.get('card'); // fallback to card
}

/**
 * Render a record using a specified layout
 */
export async function renderRecord(record, layoutName = 'card') {
  const fields = extractFields(record);
  const layout = getLayout(layoutName);
  const result = layout(fields, record);
  // Handle both sync and async layouts
  return result instanceof Promise ? await result : result;
}

/**
 * Build Bluesky post URL from AT URI
 */
function buildBlueskyPostUrl(uri: string): string | null {
  if (!uri) return null;
  
  // Parse AT URI: at://did:plc:xxx/app.bsky.feed.post/rkey
  const match = uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)$/);
  if (!match) return null;
  
  const did = match[1];
  const rkey = match[2];
  
  return `https://bsky.app/profile/${did}/post/${rkey}`;
}

/**
 * Get all available layout names
 */
export function getAvailableLayouts() {
  return Array.from(layouts.keys());
}

// ============================================ 
// Built-in Layouts
// ============================================ 

/**
 * Card Layout - compact display for short content
 */
registerLayout('card', (fields) => {
  const html = document.createElement('article');
  html.className = 'layout-card';

  const hasImage = fields.image;
  if (hasImage) {
    const img = document.createElement('img');
    img.src = fields.image;
    img.alt = fields.title || '';
    img.className = 'card-image';
    img.loading = 'lazy';
    html.appendChild(img);
  }

  const body = document.createElement('div');
  body.className = 'card-body';

  if (fields.title) {
    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = fields.title;
    body.appendChild(title);
  }

  if (fields.content) {
    const content = document.createElement('p');
    content.className = 'card-content';
    // Truncate for card view
    content.textContent = fields.content.length > 200
      ? fields.content.slice(0, 200) + '...'
      : fields.content;
    body.appendChild(content);
  }

  if (fields.date) {
    const date = document.createElement('time');
    date.className = 'card-date';
    date.dateTime = fields.date.toISOString();
    date.textContent = formatDate(fields.date);
    
    // If this is a Bluesky post, make the date a link
    const blueskyUrl = buildBlueskyPostUrl(fields.uri);
    if (blueskyUrl) {
      const link = document.createElement('a');
      link.href = blueskyUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'card-date-link';
      link.appendChild(date);
      body.appendChild(link);
    } else {
      body.appendChild(date);
    }
  }

  html.appendChild(body);
  return html;
});

/**
 * Post Layout - full article display for long-form content
 */
registerLayout('post', async (fields) => {
  const html = document.createElement('article');
  html.className = 'layout-post';

  if (fields.title) {
    const title = document.createElement('h2');
    title.className = 'post-title';
    title.textContent = fields.title;
    html.appendChild(title);
  }

  const meta = document.createElement('div');
  meta.className = 'post-meta';

  // Try to get author avatar for Bluesky posts
  let authorAvatar = null;
  if (fields.uri) {
    const parsed = parseAtUri(fields.uri);
    if (parsed && parsed.collection === 'app.bsky.feed.post') {
      try {
        const profile = await getProfile(parsed.did);
        if (profile && profile.avatar) {
          authorAvatar = profile.avatar;
        }
      } catch (error) {
        // Profile fetch is optional, continue without avatar
        console.warn('Failed to fetch author profile:', error);
      }
    }
  }

  // Add avatar if available
  if (authorAvatar) {
    const avatar = document.createElement('img');
    avatar.src = authorAvatar;
    avatar.alt = '';
    avatar.className = 'post-avatar';
    meta.appendChild(avatar);
  }

  if (fields.date) {
    const date = document.createElement('time');
    date.dateTime = fields.date.toISOString();
    date.textContent = formatDate(fields.date);
    
    // If this is a Bluesky post, make the date a link
    const blueskyUrl = buildBlueskyPostUrl(fields.uri);
    if (blueskyUrl) {
      const link = document.createElement('a');
      link.href = blueskyUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'post-date-link';
      link.appendChild(date);
      meta.appendChild(link);
    } else {
      meta.appendChild(date);
    }
  }

  if (fields.tags?.length > 0) {
    const tags = document.createElement('div');
    tags.className = 'post-tags';
    fields.tags.forEach(tag => {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = tag;
      tags.appendChild(span);
    });
    meta.appendChild(tags);
  }

  if (meta.children.length > 0) {
    html.appendChild(meta);
  }

  // Render multiple images if available, otherwise fall back to single image
  if (fields.images && fields.images.length > 0) {
    const imageContainer = document.createElement('div');
    imageContainer.className = 'post-images';

    // Add count-based class for grid layout
    const count = fields.images.length;
    imageContainer.classList.add(
      count === 1 ? 'post-images-single' :
      count === 2 ? 'post-images-two' :
      count === 3 ? 'post-images-three' : 'post-images-grid'
    );

    fields.images.forEach((imgData: string | { url: string; alt?: string }, index: number) => {
      const img = document.createElement('img');
      if (typeof imgData === 'object' && imgData.url) {
        img.src = imgData.url;
        img.alt = imgData.alt || `Image ${index + 1}`;
      } else {
        img.src = imgData as string;
        img.alt = `Image ${index + 1}`;
      }
      img.className = 'post-image';
      img.loading = 'lazy';
      imageContainer.appendChild(img);
    });

    html.appendChild(imageContainer);
  } else if (fields.image) {
    const img = document.createElement('img');
    img.src = fields.image;
    img.alt = fields.title || '';
    img.className = 'post-image';
    img.loading = 'lazy';
    html.appendChild(img);
  }

  if (fields.content) {
    const content = document.createElement('div');
    content.className = 'post-content';
    // Render markdown if it looks like markdown
    if (looksLikeMarkdown(fields.content)) {
      content.innerHTML = renderMarkdown(fields.content);
    } else {
      content.innerHTML = escapeHtml(fields.content).replace(/\n/g, '<br>');
    }
    html.appendChild(content);
  }

  // Add link back to Bluesky post below the content
  const blueskyUrl = buildBlueskyPostUrl(fields.uri);
  if (blueskyUrl) {
    const linkBack = document.createElement('a');
    linkBack.href = blueskyUrl;
    linkBack.target = '_blank';
    linkBack.rel = 'noopener noreferrer';
    linkBack.className = 'post-link-back';
    linkBack.textContent = 'View on Bluesky';
    html.appendChild(linkBack);
  }

  return html;
});

/**
 * Image Layout - visual-first display
 */
registerLayout('image', renderImage);

/**
 * Link Layout - single link with preview
 */
registerLayout('link', (fields) => {
  const html = document.createElement('a');
  html.className = 'layout-link';
  html.href = fields.url || '#';
  html.target = '_blank';
  html.rel = 'noopener noreferrer';

  if (fields.image) {
    const img = document.createElement('img');
    img.src = fields.image;
    img.alt = '';
    img.className = 'link-image';
    img.loading = 'lazy';
    html.appendChild(img);
  }

  const body = document.createElement('div');
  body.className = 'link-body';

  if (fields.title) {
    const title = document.createElement('span');
    title.className = 'link-title';
    title.textContent = fields.title;
    body.appendChild(title);
  }

  if (fields.content) {
    const desc = document.createElement('span');
    desc.className = 'link-description';
    desc.textContent = fields.content.slice(0, 100);
    body.appendChild(desc);
  }

  const urlDisplay = document.createElement('span');
  urlDisplay.className = 'link-url';
  try {
    urlDisplay.textContent = new URL(fields.url).hostname;
  } catch {
    urlDisplay.textContent = fields.url;
  }
  body.appendChild(urlDisplay);

  html.appendChild(body);
  return html;
});

/**
 * Links Layout - link tree style list
 */
registerLayout('links', (fields) => {
  const html = document.createElement('nav');
  html.className = 'layout-links';

  const items = fields.items || [];

  items.forEach(item => {
    const link = document.createElement('a');
    link.className = 'links-item';
    link.href = item.url || item.href || item.uri || '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    const title = document.createElement('span');
    title.className = 'links-title';
    title.textContent = item.title || item.name || item.text || link.href;
    link.appendChild(title);

    if (item.icon) {
      const icon = document.createElement('span');
      icon.className = 'links-icon';
      icon.textContent = item.icon;
      link.prepend(icon);
    }

    html.appendChild(link);
  });

  return html;
});

/**
 * List Layout - generic list of items
 */
registerLayout('list', (fields) => {
  const html = document.createElement('ul');
  html.className = 'layout-list';

  const items = fields.items || [];

  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'list-item';

    if (typeof item === 'string') {
      li.textContent = item;
    } else {
      li.textContent = item.title || item.name || item.text || JSON.stringify(item);
    }

    html.appendChild(li);
  });

  return html;
});

/**
 * Profile Layout - about section display with optional banner
 */
registerLayout('profile', (fields) => {
  const html = document.createElement('div');
  html.className = 'layout-profile';

  // Banner image at the top (if present)
  if (fields.banner) {
    const bannerWrapper = document.createElement('div');
    bannerWrapper.className = 'profile-banner';
    
    const banner = document.createElement('img');
    banner.src = fields.banner;
    banner.alt = '';
    banner.className = 'profile-banner-image';
    
    bannerWrapper.appendChild(banner);
    html.appendChild(bannerWrapper);
  }

  // Profile body (avatar + info)
  const body = document.createElement('div');
  body.className = 'profile-body';

  if (fields.image) {
    const avatar = document.createElement('img');
    avatar.src = fields.image;
    avatar.alt = fields.title || 'Avatar';
    avatar.className = 'profile-avatar';
    body.appendChild(avatar);
  }

  const info = document.createElement('div');
  info.className = 'profile-info';

  if (fields.title) {
    const name = document.createElement('h2');
    name.className = 'profile-name';
    name.textContent = fields.title;
    info.appendChild(name);
  }

  if (fields.content) {
    const bio = document.createElement('p');
    bio.className = 'profile-bio';
    bio.textContent = fields.content;
    info.appendChild(bio);
  }

  body.appendChild(info);
  html.appendChild(body);
  return html;
});

/**
 * Raw Layout - custom HTML content
 * HTML is sanitized to prevent XSS while preserving formatting.
 */
registerLayout('raw', (fields) => {
  const html = document.createElement('div');
  html.className = 'layout-raw';

  if (fields.content) {
    html.innerHTML = sanitizeHtml(fields.content);
  }

  return html;
});

/**
 * Flower Bed Layout - displays planted flowers
 */
registerLayout('flower-bed', renderFlowerBed);

/**
 * Collected Flowers Layout - displays flowers taken from other gardens
 */
registerLayout('collected-flowers', renderCollectedFlowers);

/**
 * Special Spore Display Layout - displays the special spore item
 */
registerLayout('special-spore-display', renderSpecialSporeDisplay);

/**
 * Smoke Signal Events Layout - displays events (hosting/attending)
 */
registerLayout('smoke-signal', renderSmokeSignal);

/**
 * Leaflet.pub Layout - displays long-form articles from leaflet.pub (AT Protocol long-form publishing)
 */
registerLayout('leaflet', renderLeaflet);

// ============================================ 
// Helper Functions
// ============================================ 

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date);
}