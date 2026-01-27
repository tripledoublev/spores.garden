/**
 * Loading spinner and error UI utilities
 */

/**
 * Create a loading spinner element
 */
export function createSpinner(message?: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'loading-state';
  
  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  
  container.appendChild(spinner);
  
  if (message) {
    const messageEl = document.createElement('p');
    messageEl.className = 'loading-message';
    messageEl.textContent = message;
    container.appendChild(messageEl);
  }
  
  return container;
}

/**
 * Create an error message element with optional retry button
 */
export function createErrorMessage(
  message: string,
  retryCallback?: () => void | Promise<void>
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'error-state';
  container.setAttribute('role', 'alert');
  container.setAttribute('aria-live', 'polite');
  
  const errorIcon = document.createElement('span');
  errorIcon.className = 'error-icon';
  errorIcon.setAttribute('aria-hidden', 'true');
  errorIcon.textContent = '⚠';
  
  const errorText = document.createElement('p');
  errorText.className = 'error-message';
  errorText.textContent = message;
  
  container.appendChild(errorIcon);
  container.appendChild(errorText);
  
  if (retryCallback) {
    const retryButton = document.createElement('button');
    retryButton.className = 'button button-secondary button-small';
    retryButton.textContent = 'Retry';
    retryButton.setAttribute('aria-label', 'Retry loading');
    retryButton.addEventListener('click', async () => {
      retryButton.disabled = true;
      retryButton.textContent = 'Retrying...';
      try {
        await retryCallback();
      } catch (error) {
        console.error('Retry failed:', error);
        retryButton.disabled = false;
        retryButton.textContent = 'Retry';
      }
    });
    container.appendChild(retryButton);
  }
  
  return container;
}

/**
 * Wrap an async operation with loading and error states
 */
export async function withLoadingState<T>(
  container: HTMLElement,
  asyncOperation: () => Promise<T>,
  options?: {
    loadingMessage?: string;
    errorMessage?: string;
    onError?: (error: Error) => void;
    retryCallback?: () => Promise<T>;
  }
): Promise<T | null> {
  // Show loading state
  const loadingEl = createSpinner(options?.loadingMessage);
  container.innerHTML = '';
  container.appendChild(loadingEl);
  
  try {
    const result = await asyncOperation();
    return result;
  } catch (error) {
    console.error('Operation failed:', error);
    
    if (options?.onError) {
      options.onError(error as Error);
    }
    
    // Show error state
    const errorEl = createErrorMessage(
      options?.errorMessage || 'Failed to load content',
      options?.retryCallback
        ? async () => { await withLoadingState(container, options.retryCallback!, options); }
        : undefined
    );
    
    container.innerHTML = '';
    container.appendChild(errorEl);
    
    return null;
  }
}
