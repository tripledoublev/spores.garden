import { extractFields } from '../records/field-extractor';
import { createErrorMessage } from '../utils/loading-states';

/**
 * Image Layout - visual-first display for images
 *
 * Extracts and renders images from AT Protocol records.
 * Supports both single images and image galleries. Images are displayed inline (no lightbox).
 *
 * @param fields - Extracted fields from the record
 * @param record - Optional original record reference (not used, but matches layout signature)
 */
export function renderImage(fields: ReturnType<typeof extractFields>, record?: any): HTMLElement {
  const html = document.createElement('figure');
  html.className = 'layout-image';

  try {
    // Single image
    if (fields.image) {
      const imgContainer = document.createElement('div');
      imgContainer.className = 'image-container';
      imgContainer.style.position = 'relative';
      
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
      img.src = fields.image;
      const altText = fields.title || fields.content || 'Image';
      img.alt = altText;
      img.className = 'image-main';
      img.loading = 'lazy';
      img.style.opacity = '0';
      img.style.transition = 'opacity 0.3s ease';
      
      // Handle successful load
      img.addEventListener('load', () => {
        img.style.opacity = '1';
        loadingOverlay.style.display = 'none';
      });
      
      // Add error handling with retry
      img.addEventListener('error', () => {
        loadingOverlay.style.display = 'none';
        img.style.display = 'none';
        const errorContainer = document.createElement('div');
        errorContainer.className = 'image-error-container';
        const errorMsg = createErrorMessage(
          'Failed to load image',
          () => {
            // Retry by reloading the image
            img.src = '';
            img.style.display = '';
            img.style.opacity = '0';
            loadingOverlay.style.display = 'flex';
            img.src = fields.image;
            errorContainer.remove();
          },
          'The image may be temporarily unavailable or the URL may be incorrect.'
        );
        errorContainer.appendChild(errorMsg);
        imgContainer.appendChild(errorContainer);
      });
      
      imgContainer.appendChild(img);
      html.appendChild(imgContainer);
    } 
  // Image gallery
  else if (fields.images?.length > 0) {
    const gallery = document.createElement('div');
    gallery.className = 'image-gallery';
    
    const totalImages = fields.images.length;
    const displayCount = Math.min(4, totalImages);
    const remainingCount = totalImages - displayCount;

    fields.images.slice(0, displayCount).forEach((src, index) => {
      const srcUrl = typeof src === 'string' ? src : src.url;
      const imgContainer = document.createElement('div');
      imgContainer.className = 'image-gallery-item';
      imgContainer.style.position = 'relative';
      
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
      spinner.style.width = '24px';
      spinner.style.height = '24px';
      loadingOverlay.appendChild(spinner);
      imgContainer.appendChild(loadingOverlay);
      
      const img = document.createElement('img');
      img.src = srcUrl;
      const altText = fields.title ? `${fields.title} - Image ${index + 1} of ${totalImages}` : `Image ${index + 1} of ${totalImages}`;
      img.alt = altText;
      img.loading = 'lazy';
      img.style.opacity = '0';
      img.style.transition = 'opacity 0.3s ease';
      
      // Handle successful load
      img.addEventListener('load', () => {
        img.style.opacity = '1';
        loadingOverlay.style.display = 'none';
      });
      
      // Add error handling with retry
      img.addEventListener('error', () => {
        loadingOverlay.style.display = 'none';
        img.style.display = 'none';
        const errorContainer = document.createElement('div');
        errorContainer.className = 'image-error-container';
        const errorMsg = createErrorMessage(
          'Failed to load image',
          () => {
            // Retry by reloading the image
            img.src = '';
            img.style.display = '';
            img.style.opacity = '0';
            loadingOverlay.style.display = 'flex';
            img.src = srcUrl;
            errorContainer.remove();
          },
          `Image ${index + 1} failed to load`
        );
        errorContainer.appendChild(errorMsg);
        imgContainer.appendChild(errorContainer);
      });
      
      imgContainer.appendChild(img);
      
      // Add "+X more" overlay on the last visible image if there are more
      if (index === displayCount - 1 && remainingCount > 0) {
        const overlay = document.createElement('span');
        overlay.className = 'image-gallery-more';
        overlay.textContent = `+${remainingCount} more`;
        overlay.setAttribute('aria-label', `${totalImages} images in gallery`);
        imgContainer.appendChild(overlay);
      }
      
      gallery.appendChild(imgContainer);
    });
    
    html.appendChild(gallery);
  }
    // No image found
    else {
      const noImage = document.createElement('p');
      noImage.className = 'image-empty';
      noImage.setAttribute('role', 'status');
      noImage.setAttribute('aria-live', 'polite');
      noImage.textContent = 'No image found in record';
      html.appendChild(noImage);
    }

    // Caption from title or content
    if (fields.title || fields.content) {
      const caption = document.createElement('figcaption');
      caption.className = 'image-caption';
      caption.textContent = fields.title || fields.content;
      html.appendChild(caption);
    }
  } catch (error) {
    console.error('Failed to render image layout:', error);
    const errorEl = createErrorMessage(
      'Failed to render image',
      undefined,
      error instanceof Error ? error.message : String(error)
    );
    html.appendChild(errorEl);
  }

  return html;
}
