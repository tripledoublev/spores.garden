/**
 * HTML Sanitization Utilities
 *
 * Provides safe HTML handling to prevent XSS attacks.
 */

import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content, allowing only safe tags and attributes.
 * Use this for user-generated HTML content that needs formatting.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'u',
      'del',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'hr',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'a', 'code', 'pre', 'blockquote',
      'img', 'figure', 'figcaption',
      'div', 'span'
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'title'],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'], // Allow target attribute
    FORCE_BODY: true
  });
}

/**
 * Escape HTML special characters for safe text display.
 * Use this for untrusted text that should NOT contain HTML.
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
