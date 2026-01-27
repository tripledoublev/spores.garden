import { extractFields } from '../records/field-extractor';
import { createErrorMessage } from '../utils/loading-states';

/**
 * Image Layout - visual-first display for images
 * 
 * Extracts and renders images from AT Protocol records.
 * Supports both single images and image galleries with lightbox modal.
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
      img.style.cursor = 'pointer';
      img.style.opacity = '0';
      img.style.transition = 'opacity 0.3s ease';
      img.setAttribute('role', 'button');
      img.setAttribute('tabindex', '0');
      img.setAttribute('aria-label', `View larger image: ${altText}`);
      
      // Add click handler to open in modal
      const openModal = () => {
        openImageModal([fields.image], 0, fields.title || fields.content || '');
      };
      img.addEventListener('click', openModal);
      
      // Keyboard accessibility
      img.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal();
        }
      });
      
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
    
    const imageUrls = fields.images.map((img: string | { url: string; alt?: string }) => typeof img === 'string' ? img : img.url);

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
      img.style.cursor = 'pointer';
      img.style.opacity = '0';
      img.style.transition = 'opacity 0.3s ease';
      img.setAttribute('role', 'button');
      img.setAttribute('tabindex', '0');
      img.setAttribute('aria-label', `View image ${index + 1} of ${totalImages} in gallery`);
      
      // Add click handler to open modal at this image
      const openModal = () => {
        openImageModal(imageUrls, index, fields.title || fields.content || '');
      };
      img.addEventListener('click', openModal);
      
      // Keyboard accessibility
      img.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal();
        }
      });
      
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
        const overlay = document.createElement('button');
        overlay.className = 'image-gallery-more';
        overlay.textContent = `+${remainingCount} more`;
        overlay.setAttribute('aria-label', `View all ${totalImages} images in gallery`);
        overlay.setAttribute('type', 'button');
        overlay.addEventListener('click', (e) => {
          e.stopPropagation();
          openImageModal(imageUrls, index, fields.title || fields.content || '');
        });
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

/**
 * Opens a modal lightbox to display images with navigation
 */
function openImageModal(images: string[], startIndex: number, title: string): void {
  // Remove existing modal if present
  const existingModal = document.querySelector('.image-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  const modal = document.createElement('div');
  modal.className = 'image-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', title || 'Image gallery');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-describedby', 'image-modal-counter');
  
  const modalContent = document.createElement('div');
  modalContent.className = 'image-modal-content';
  
  const modalHeader = document.createElement('div');
  modalHeader.className = 'image-modal-header';
  
  const modalTitle = document.createElement('h3');
  modalTitle.className = 'image-modal-title';
  modalTitle.textContent = title || 'Image Gallery';
  
  const closeButton = document.createElement('button');
  closeButton.className = 'image-modal-close';
  closeButton.setAttribute('aria-label', 'Close gallery');
  closeButton.innerHTML = '×';
  closeButton.addEventListener('click', () => closeImageModal(modal));
  
  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(closeButton);
  
  const imageContainer = document.createElement('div');
  imageContainer.className = 'image-modal-image-container';
  
  let currentIndex = startIndex;
  
  const displayImage = (index: number) => {
    imageContainer.innerHTML = '';
    imageContainer.style.position = 'relative';
    
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
    loadingOverlay.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    loadingOverlay.style.zIndex = '1';
    
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.style.width = '40px';
    spinner.style.height = '40px';
    loadingOverlay.appendChild(spinner);
    imageContainer.appendChild(loadingOverlay);
    
    const img = document.createElement('img');
    img.src = images[index];
    img.alt = title ? `${title} - Image ${index + 1} of ${images.length}` : `Image ${index + 1} of ${images.length}`;
    img.className = 'image-modal-image';
    img.style.opacity = '0';
    img.style.transition = 'opacity 0.3s ease';
    
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
          // Retry by reloading
          img.src = '';
          img.style.display = '';
          img.style.opacity = '0';
          loadingOverlay.style.display = 'flex';
          img.src = images[index];
          const existingError = imageContainer.querySelector('.error-state');
          if (existingError) {
            existingError.remove();
          }
        },
        `Image ${index + 1} of ${images.length} failed to load`
      );
      imageContainer.appendChild(errorMsg);
    });
    
    imageContainer.appendChild(img);
    
    // Update counter
    const counter = document.querySelector('.image-modal-counter');
    if (counter) {
      counter.textContent = `${index + 1} / ${images.length}`;
    }
  };
  
  displayImage(currentIndex);
  
  // Navigation buttons
  const navContainer = document.createElement('div');
  navContainer.className = 'image-modal-nav';
  
  const prevButton = document.createElement('button');
  prevButton.className = 'image-modal-nav-button image-modal-prev';
  prevButton.setAttribute('aria-label', 'Previous image');
  prevButton.innerHTML = '‹';
  prevButton.addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    displayImage(currentIndex);
  });
  
  const nextButton = document.createElement('button');
  nextButton.className = 'image-modal-nav-button image-modal-next';
  nextButton.setAttribute('aria-label', 'Next image');
  nextButton.innerHTML = '›';
  nextButton.addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % images.length;
    displayImage(currentIndex);
  });
  
  // Counter
  const counter = document.createElement('div');
  counter.id = 'image-modal-counter';
  counter.className = 'image-modal-counter';
  counter.setAttribute('role', 'status');
  counter.setAttribute('aria-live', 'polite');
  counter.textContent = `${currentIndex + 1} / ${images.length}`;
  
  navContainer.appendChild(prevButton);
  navContainer.appendChild(counter);
  navContainer.appendChild(nextButton);
  
  modalContent.appendChild(modalHeader);
  modalContent.appendChild(imageContainer);
  modalContent.appendChild(navContainer);
  
  modal.appendChild(modalContent);
  
  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeImageModal(modal);
    }
  });
  
  // Keyboard navigation
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeImageModal(modal);
    } else if (e.key === 'ArrowLeft') {
      currentIndex = (currentIndex - 1 + images.length) % images.length;
      displayImage(currentIndex);
    } else if (e.key === 'ArrowRight') {
      currentIndex = (currentIndex + 1) % images.length;
      displayImage(currentIndex);
    }
  };
  
  document.addEventListener('keydown', handleKeyDown);
  
  // Store handler for cleanup
  (modal as any)._keyHandler = handleKeyDown;
  
  document.body.appendChild(modal);
  
  // Focus trap - focus the modal content for accessibility
  modalContent.setAttribute('tabindex', '-1');
  modalContent.focus();
  
  // Trap focus within modal
  const focusableElements = modal.querySelectorAll<HTMLElement>(
    'button, [href], [tabindex]:not([tabindex="-1"])'
  );
  const firstFocusable = focusableElements[0] as HTMLElement;
  const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;
  
  const trapFocus = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    
    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }
  };
  
  modal.addEventListener('keydown', trapFocus);
  (modal as any)._focusTrap = trapFocus;
  
  // Prevent body scroll
  document.body.style.overflow = 'hidden';
}

/**
 * Closes the image modal and cleans up
 */
function closeImageModal(modal: HTMLElement): void {
  // Remove keyboard handler
  const handler = (modal as any)._keyHandler;
  if (handler) {
    document.removeEventListener('keydown', handler);
  }
  
  // Remove focus trap handler
  const focusTrap = (modal as any)._focusTrap;
  if (focusTrap) {
    modal.removeEventListener('keydown', focusTrap);
  }
  
  // Restore body scroll
  document.body.style.overflow = '';
  
  // Remove modal
  modal.remove();
}
