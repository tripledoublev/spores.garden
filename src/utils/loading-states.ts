/**
 * Loading and Error State Utilities
 * 
 * Provides reusable components for loading indicators, error messages, and retry mechanisms.
 */

/**
 * Create a loading spinner element
 */
export function createLoadingSpinner(message: string = 'Loading...'): HTMLElement {
  const container = document.createElement('div');
  container.className = 'loading-state';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-label', message);

  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  spinner.setAttribute('aria-hidden', 'true');

  const text = document.createElement('p');
  text.className = 'loading-text';
  text.textContent = message;

  container.appendChild(spinner);
  container.appendChild(text);

  return container;
}

/**
 * Create an error message with optional retry button
 */
export function createErrorMessage(
  message: string,
  onRetry?: () => void | Promise<void>,
  details?: string
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'error-state';
  container.setAttribute('role', 'alert');
  container.setAttribute('aria-live', 'assertive');

  const errorIcon = document.createElement('div');
  errorIcon.className = 'error-icon';
  errorIcon.setAttribute('aria-hidden', 'true');
  errorIcon.textContent = '⚠';

  const errorMessage = document.createElement('p');
  errorMessage.className = 'error-message';
  errorMessage.textContent = message;

  container.appendChild(errorIcon);
  container.appendChild(errorMessage);

  if (details) {
    const errorDetails = document.createElement('p');
    errorDetails.className = 'error-details';
    errorDetails.textContent = details;
    container.appendChild(errorDetails);
  }

  if (onRetry) {
    const retryButton = document.createElement('button');
    retryButton.className = 'button button-secondary button-retry';
    retryButton.textContent = 'Retry';
    retryButton.setAttribute('type', 'button');
    retryButton.setAttribute('aria-label', 'Retry loading');
    retryButton.addEventListener('click', async () => {
      retryButton.disabled = true;
      retryButton.textContent = 'Retrying...';
      try {
        await onRetry();
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
 * Wrap an async operation with loading and error handling
 */
export async function withLoadingState<T>(
  container: HTMLElement,
  operation: () => Promise<T>,
  loadingMessage: string = 'Loading...',
  errorMessage: string = 'Failed to load',
  onRetry?: () => Promise<T>
): Promise<T | null> {
  // Show loading state
  const loadingEl = createLoadingSpinner(loadingMessage);
  container.innerHTML = '';
  container.appendChild(loadingEl);

  try {
    const result = await operation();
    return result;
  } catch (error) {
    console.error('Operation failed:', error);
    const errorEl = createErrorMessage(
      errorMessage,
      onRetry ? async () => {
        await withLoadingState(container, onRetry, loadingMessage, errorMessage, onRetry);
      } : undefined,
      error instanceof Error ? error.message : String(error)
    );
    container.innerHTML = '';
    container.appendChild(errorEl);
    return null;
  }
}
