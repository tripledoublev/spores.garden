/**
 * Standard.site Long-Form Publishing Layout
 *
 * Displays long-form articles from site.standard.document (Standard.site / AT Protocol long-form).
 * Renders block-based content structure with support for text, images, headers, lists, and formatting.
 * When canonicalUrl is present, links to the canonical URL for full content.
 *
 * Fields are pre-extracted by the field-extractor before this function is called.
 */

import { extractFields } from '../records/field-extractor';
import { listRecords } from '../at-client';
import { getRecordByUri } from '../records/loader';
import { createErrorMessage } from '../utils/loading-states';

const SITE_STANDARD_PUBLICATION = 'site.standard.publication';
const SITE_STANDARD_DOCUMENT = 'site.standard.document';

/**
 * Fetch the document owner's site.standard.publication and build the read-more URL
 * from publication.url + document path (per Standard.site: canonical document URL
 * is publication url + document path).
 * Resolves the publication by: (1) document's canonicalUrl (preferred),
 * (2) document's site or publication ref (AT URI), (3) else list site.standard.publication
 * for the repo and use the first record.
 */
async function fetchPublicationReadMoreUrl(record: { uri?: string; value?: { canonicalUrl?: string; site?: string | { uri?: string }; publication?: string | { uri?: string } } }): Promise<string | undefined> {
  // Prefer canonicalUrl when present
  const canonicalUrl = record.value?.canonicalUrl;
  if (typeof canonicalUrl === 'string' && canonicalUrl.startsWith('https://')) {
    return canonicalUrl;
  }

  const uri = record?.uri;
  if (!uri || !uri.includes(SITE_STANDARD_DOCUMENT)) return undefined;
  const parts = uri.split('/');
  const did = parts[2];
  const docRkey = parts[parts.length - 1];
  if (!did || !docRkey) return undefined;

  let pub: { value?: { url?: string } } | null = null;

  // Check site or publication ref (Standard.site uses 'site', some use 'publication')
  const publicationRef = record.value?.site ?? record.value?.publication;
  const publicationUri = typeof publicationRef === 'string' ? publicationRef : publicationRef?.uri;
  if (publicationUri && publicationUri.includes(SITE_STANDARD_PUBLICATION)) {
    pub = await getRecordByUri(publicationUri);
  }
  if (!pub?.value?.url) {
    const data = await listRecords(did, SITE_STANDARD_PUBLICATION, { limit: 1 });
    const first = data?.records?.[0];
    if (first?.value) pub = first as { value: { url?: string } };
  }

  const base = pub?.value?.url;
  if (typeof base !== 'string' || !base.startsWith('https://')) return undefined;
  return `${base.replace(/\/$/, '')}/${docRkey}`;
}

/**
 * Append the "Read full article" link block to the article container
 */
function appendReadMoreLink(container: HTMLElement, url: string): void {
  const linkBack = document.createElement('div');
  linkBack.className = 'leaflet-link-back';
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'See original post →';
  link.setAttribute('aria-label', 'See original post - Opens in new tab');
  linkBack.appendChild(link);
  container.appendChild(linkBack);
}

/**
 * Format a blob URL from a Standard.site blob reference
 */
function formatLeafletBlobUrl(blob: any, authorDid: string): string | null {
  if (!blob || !blob.ref?.$link) return null;
  const cid = blob.ref.$link;
  if (!cid || !authorDid) return null;
  
  // Use CDN URL format similar to Bluesky
  // Note: This may need adjustment based on how Standard.site serves blobs
  return `https://cdn.bsky.app/img/feed_thumbnail/plain/${authorDid}/${cid}@jpeg`;
}

/**
 * Apply rich text facets to plaintext
 */
function applyFacets(plaintext: string, facets: any[]): string {
  if (!facets || facets.length === 0) return plaintext;
  
  // Convert to HTML with facets applied
  let result = '';
  let lastIndex = 0;
  
  // Sort facets by start index
  const sortedFacets = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);
  
  for (const facet of sortedFacets) {
    const { byteStart, byteEnd } = facet.index;
    
    // Add text before this facet
    if (byteStart > lastIndex) {
      result += escapeHtml(plaintext.slice(lastIndex, byteStart));
    }
    
    // Extract the text for this facet
    const facetText = plaintext.slice(byteStart, byteEnd);
    
    // Apply formatting based on features
    let formattedText = escapeHtml(facetText);
    for (const feature of facet.features || []) {
      if (feature.$type === 'pub.leaflet.richtext.facet#bold') {
        formattedText = `<strong>${formattedText}</strong>`;
      } else if (feature.$type === 'pub.leaflet.richtext.facet#italic') {
        formattedText = `<em>${formattedText}</em>`;
      }
      // Add more facet types as needed
    }
    
    result += formattedText;
    lastIndex = byteEnd;
  }
  
  // Add remaining text
  if (lastIndex < plaintext.length) {
    result += escapeHtml(plaintext.slice(lastIndex));
  }
  
  return result || escapeHtml(plaintext);
}

/**
 * Escape HTML
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Render a single block
 */
function renderBlock(block: any, authorDid: string, _depth: number = 0): HTMLElement | DocumentFragment | null {
  if (!block || !block.block) return null;
  
  const blockType = block.block.$type;
  const fragment = document.createDocumentFragment();
  
  switch (blockType) {
    case 'pub.leaflet.blocks.text': {
      const textBlock = block.block;
      const plaintext = (textBlock.plaintext || '').trim();
      if (plaintext === '') return null;
      const p = document.createElement('p');
      if (textBlock.facets && textBlock.facets.length > 0) {
        p.innerHTML = applyFacets(textBlock.plaintext || '', textBlock.facets);
      } else {
        p.textContent = textBlock.plaintext || '';
      }
      fragment.appendChild(p);
      break;
    }
    
    case 'pub.leaflet.blocks.header': {
      const headerBlock = block.block;
      const level = headerBlock.level || 2;
      const tag = `h${Math.min(Math.max(level, 1), 6)}`;
      const header = document.createElement(tag);
      if (headerBlock.facets && headerBlock.facets.length > 0) {
        header.innerHTML = applyFacets(headerBlock.plaintext || '', headerBlock.facets);
      } else {
        header.textContent = headerBlock.plaintext || '';
      }
      fragment.appendChild(header);
      break;
    }
    
    case 'pub.leaflet.blocks.image': {
      const imageBlock = block.block;
      if (imageBlock.image) {
        const figure = document.createElement('figure');
        figure.className = 'leaflet-block-image';
        figure.style.position = 'relative';
        
        // Add loading spinner overlay
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'image-loading-overlay';
        loadingOverlay.style.position = 'absolute';
        loadingOverlay.style.top = '0';
        loadingOverlay.style.left = '0';
        loadingOverlay.style.right = '0';
        loadingOverlay.style.bottom = '0';
        loadingOverlay.style.display = 'flex';
        loadingOverlay.style.alignItems = 'center';
        loadingOverlay.style.justifyContent = 'center';
        loadingOverlay.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
        loadingOverlay.style.zIndex = '1';
        
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        spinner.style.width = '32px';
        spinner.style.height = '32px';
        loadingOverlay.appendChild(spinner);
        figure.appendChild(loadingOverlay);
        
        const img = document.createElement('img');
        const blobUrl = formatLeafletBlobUrl(imageBlock.image, authorDid);
        if (blobUrl) {
          img.src = blobUrl;
          img.loading = 'lazy';
          img.alt = imageBlock.alt || 'Article image';
          
          // Add aspect ratio if available
          if (imageBlock.aspectRatio) {
            const { width, height } = imageBlock.aspectRatio;
            if (width && height) {
              img.style.aspectRatio = `${width}/${height}`;
            }
          }
          
          img.style.opacity = '0';
          img.style.transition = 'opacity 0.3s ease';
          img.setAttribute('aria-label', imageBlock.alt || 'Article image');
          
          img.addEventListener('load', () => {
            img.style.opacity = '1';
            loadingOverlay.style.display = 'none';
          });
          
          img.addEventListener('error', () => {
            loadingOverlay.style.display = 'none';
            img.style.display = 'none';
            const errorMsg = createErrorMessage(
              'Failed to load image',
              () => {
                img.src = '';
                img.style.display = '';
                img.style.opacity = '0';
                loadingOverlay.style.display = 'flex';
                img.src = blobUrl;
                const existingError = figure.querySelector('.error-state');
                if (existingError) {
                  existingError.remove();
                }
              }
            );
            figure.appendChild(errorMsg);
          });
          
          figure.appendChild(img);
          fragment.appendChild(figure);
        }
      }
      break;
    }
    
    case 'pub.leaflet.blocks.unorderedList': {
      const listBlock = block.block;
      if (listBlock.children && listBlock.children.length > 0) {
        const ul = document.createElement('ul');
        ul.className = 'leaflet-block-list';
        
        for (const item of listBlock.children) {
          if (item.$type === 'pub.leaflet.blocks.unorderedList#listItem') {
            const li = document.createElement('li');
            
            // Render item content (text block)
            if (item.content && item.content.$type === 'pub.leaflet.blocks.text') {
              const textContent = item.content;
              if (textContent.facets && textContent.facets.length > 0) {
                li.innerHTML = applyFacets(textContent.plaintext || '', textContent.facets);
              } else {
                li.textContent = textContent.plaintext || '';
              }
            }
            
            // Render nested children if any
            if (item.children && item.children.length > 0) {
              const nestedUl = document.createElement('ul');
              for (const childItem of item.children) {
                const nestedLi = document.createElement('li');
                if (childItem.content && childItem.content.$type === 'pub.leaflet.blocks.text') {
                  const textContent = childItem.content;
                  if (textContent.facets && textContent.facets.length > 0) {
                    nestedLi.innerHTML = applyFacets(textContent.plaintext || '', textContent.facets);
                  } else {
                    nestedLi.textContent = textContent.plaintext || '';
                  }
                }
                nestedUl.appendChild(nestedLi);
              }
              li.appendChild(nestedUl);
            }
            
            ul.appendChild(li);
          }
        }
        
        fragment.appendChild(ul);
      }
      break;
    }
    
    case 'pub.leaflet.blocks.horizontalRule': {
      const hr = document.createElement('hr');
      fragment.appendChild(hr);
      break;
    }
    
    default:
      // Unknown block type - try to render as text if it has plaintext
      if (block.block.plaintext) {
        const p = document.createElement('p');
        p.textContent = block.block.plaintext;
        p.className = 'leaflet-unknown-block';
        fragment.appendChild(p);
      }
      break;
  }
  
  return fragment.children.length > 0 ? fragment : null;
}

/**
 * Render Standard.site article blocks
 */
function renderBlocks(pages: any[], authorDid: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  
  for (const page of pages || []) {
    if (page.$type === 'pub.leaflet.pages.linearDocument' && page.blocks) {
      for (const block of page.blocks) {
        const rendered = renderBlock(block, authorDid);
        if (rendered) {
          fragment.appendChild(rendered);
        }
      }
    }
  }
  
  return fragment;
}

/**
 * Render a Standard.site article record
 * 
 * @param fields - Extracted fields from the record
 * @param record - Original record reference (needed for accessing raw structure)
 */
export function renderLeaflet(fields: ReturnType<typeof extractFields>, record?: any): HTMLElement {
  const el = document.createElement('article');
  el.className = 'layout-leaflet';
  el.setAttribute('aria-label', 'Standard.site article');

  try {
    // Extract fields
    const title = fields.title || 'Untitled Article';
    const date = fields.date;
    const url = fields.url;
    const readMoreUrl = url && typeof url === 'string' && url.startsWith('https://') ? url : undefined;
    const image = fields.image;
    const tags = fields.tags;
    const description = fields.description;
    const textContent = record?.value?.textContent;
    
    // Get author DID from record for blob URLs
    const authorDid = record?.value?.author || record?.uri?.split('/')[2] || '';
    
    // Get the raw document structure for blocks
    const documentValue = record?.value?.pages
      ? record.value
      : record?.value?.content || fields.content;
    const pages = documentValue?.pages || documentValue?.content?.pages || [];

    // Container for the article
    const container = document.createElement('div');
    container.className = 'leaflet-article';

    // Metadata badge
    const badge = document.createElement('div');
    badge.className = 'leaflet-badge';
    badge.textContent = 'standard.site.document';
    badge.setAttribute('aria-label', 'Published as standard.site.document');
    container.appendChild(badge);

    // Article header with title
    const header = document.createElement('header');
    header.className = 'leaflet-header';

    const titleEl = document.createElement('h1');
    titleEl.className = 'leaflet-title';
    if (readMoreUrl) {
      const titleLink = document.createElement('a');
      titleLink.href = readMoreUrl;
      titleLink.target = '_blank';
      titleLink.rel = 'noopener noreferrer';
      titleLink.textContent = title;
      titleEl.appendChild(titleLink);
    } else {
      titleEl.textContent = title;
    }
    header.appendChild(titleEl);

    // Article metadata
    const meta = document.createElement('div');
    meta.className = 'leaflet-meta';

    // Date
    if (date) {
      const dateEl = document.createElement('time');
      dateEl.className = 'leaflet-date';
      dateEl.dateTime = date instanceof Date ? date.toISOString() : new Date(date).toISOString();
      const dateObj = date instanceof Date ? date : new Date(date);
      let formattedDate = '';
      if (!isNaN(dateObj.getTime())) {
        formattedDate = dateObj.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        dateEl.textContent = formattedDate;
      } else {
        formattedDate = String(date);
        dateEl.textContent = formattedDate;
      }
      dateEl.setAttribute('aria-label', `Published on ${formattedDate}`);
      meta.appendChild(dateEl);
    }

    // Tags
    if (tags && Array.isArray(tags) && tags.length > 0) {
      const tagsEl = document.createElement('div');
      tagsEl.className = 'leaflet-tags';
      tagsEl.setAttribute('aria-label', 'Article tags');
      tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'leaflet-tag';
        tagSpan.textContent = tag;
        tagSpan.setAttribute('role', 'listitem');
        tagsEl.appendChild(tagSpan);
      });
      tagsEl.setAttribute('role', 'list');
      meta.appendChild(tagsEl);
    }

    if (meta.children.length > 0) {
      header.appendChild(meta);
    }

    container.appendChild(header);

    // Cover image (skip when canonicalUrl - it's the OG/social card image, redundant)
    const hasCanonicalUrl = !!record?.value?.canonicalUrl;
    if (image && !hasCanonicalUrl) {
      const imgContainer = document.createElement('div');
      imgContainer.className = 'leaflet-image';
      imgContainer.style.position = 'relative';
      
      // Handle blob reference
      let imageUrl: string | null = null;
      if (typeof image === 'string') {
        imageUrl = image;
      } else if (image.$type === 'blob' || image.ref) {
        imageUrl = formatLeafletBlobUrl(image, authorDid);
      }
      
      if (imageUrl) {
        // Add loading spinner overlay
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'image-loading-overlay';
        loadingOverlay.style.position = 'absolute';
        loadingOverlay.style.top = '0';
        loadingOverlay.style.left = '0';
        loadingOverlay.style.right = '0';
        loadingOverlay.style.bottom = '0';
        loadingOverlay.style.display = 'flex';
        loadingOverlay.style.alignItems = 'center';
        loadingOverlay.style.justifyContent = 'center';
        loadingOverlay.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
        loadingOverlay.style.zIndex = '1';
        
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        spinner.style.width = '32px';
        spinner.style.height = '32px';
        loadingOverlay.appendChild(spinner);
        imgContainer.appendChild(loadingOverlay);
        
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = title || 'Cover image';
        img.loading = 'lazy';
        img.style.opacity = '0';
        img.style.transition = 'opacity 0.3s ease';
        img.setAttribute('aria-label', `Cover image for ${title}`);
        
        img.addEventListener('load', () => {
          img.style.opacity = '1';
          loadingOverlay.style.display = 'none';
        });
        
        img.addEventListener('error', () => {
          loadingOverlay.style.display = 'none';
          img.style.display = 'none';
          const errorMsg = createErrorMessage(
            'Failed to load cover image',
            () => {
              img.src = '';
              img.style.display = '';
              img.style.opacity = '0';
              loadingOverlay.style.display = 'flex';
              img.src = imageUrl;
              const existingError = imgContainer.querySelector('.error-state');
              if (existingError) {
                existingError.remove();
              }
            }
          );
          imgContainer.appendChild(errorMsg);
        });
        
        imgContainer.appendChild(img);
        container.appendChild(imgContainer);
      }
    }

    // Description as subheader when available
    if (description && typeof description === 'string' && description.trim()) {
      const subheader = document.createElement('h2');
      subheader.className = 'leaflet-subheader';
      subheader.textContent = description.trim();
      container.appendChild(subheader);
    }

    // Article content: blocks, or textContent from PDS
    if (pages && pages.length > 0) {
      const blocksFragment = renderBlocks(pages, authorDid);
      if (blocksFragment.childNodes.length > 0) {
        const contentEl = document.createElement('div');
        contentEl.className = 'leaflet-content';
        contentEl.appendChild(blocksFragment);
        container.appendChild(contentEl);
      }
    }
    if (textContent && typeof textContent === 'string' && textContent.trim()) {
      const contentEl = document.createElement('div');
      contentEl.className = 'leaflet-content leaflet-text-content';
      contentEl.innerHTML = textContent.trim();
      container.appendChild(contentEl);
    }

    // Link to full article (when not already embedded via iframe): use fields.url (canonicalUrl or derived) when valid https, else for
    // site.standard.document fetch the owner's publication record and use its url + doc path
    if (readMoreUrl) {
      appendReadMoreLink(container, readMoreUrl);
    } else if (record?.uri && record.uri.includes(SITE_STANDARD_DOCUMENT)) {
      fetchPublicationReadMoreUrl(record).then((url) => {
        if (url) appendReadMoreLink(container, url);
      }).catch((err) => {
        console.warn('Failed to resolve publication read-more URL:', err);
      });
    }

    el.appendChild(container);
  } catch (error) {
    console.error('Failed to render leaflet article:', error);
    const errorEl = createErrorMessage(
      'Failed to render article',
      undefined,
      error instanceof Error ? error.message : String(error)
    );
    el.appendChild(errorEl);
  }

  return el;
}
