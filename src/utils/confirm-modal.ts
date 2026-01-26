/**
 * Custom confirmation modal that respects the app's styling.
 * Replaces browser's native confirm() dialog.
 */

export interface ConfirmModalOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmDanger?: boolean;
}

export interface AlertModalOptions {
  title?: string;
  message: string;
  buttonText?: string;
  type?: 'success' | 'error' | 'info';
}

/**
 * Shows a styled confirmation modal and returns a promise that resolves
 * to true if confirmed, false if cancelled.
 */
export function showConfirmModal(options: ConfirmModalOptions): Promise<boolean> {
  const {
    title = 'Confirm',
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    confirmDanger = false,
  } = options;

  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal confirm-modal';
    modal.innerHTML = `
      <div class="modal-content confirm-modal-content">
        <h2>${title}</h2>
        <p class="confirm-modal-message">${message}</p>
        <div class="modal-actions">
          <button class="button button-secondary confirm-modal-cancel">${cancelText}</button>
          <button class="button ${confirmDanger ? 'button-danger' : ''} confirm-modal-confirm">${confirmText}</button>
        </div>
      </div>
    `;

    const cleanup = (result: boolean) => {
      modal.remove();
      resolve(result);
    };

    // Confirm button
    modal.querySelector('.confirm-modal-confirm')?.addEventListener('click', () => {
      cleanup(true);
    });

    // Cancel button
    modal.querySelector('.confirm-modal-cancel')?.addEventListener('click', () => {
      cleanup(false);
    });

    // Click outside to cancel
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cleanup(false);
      }
    });

    // Escape key to cancel
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleKeydown);
        cleanup(false);
      }
    };
    document.addEventListener('keydown', handleKeydown);

    document.body.appendChild(modal);

    // Focus the confirm button for accessibility
    (modal.querySelector('.confirm-modal-confirm') as HTMLButtonElement)?.focus();
  });
}

/**
 * Shows a styled alert modal with a single button.
 * Replaces browser's native alert() dialog.
 */
export function showAlertModal(options: AlertModalOptions): Promise<void> {
  const {
    title = 'Notice',
    message,
    buttonText = 'OK',
    type = 'info',
  } = options;

  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal alert-modal';

    const typeClass = type === 'success' ? 'alert-success' : type === 'error' ? 'alert-error' : '';
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : '';

    modal.innerHTML = `
      <div class="modal-content alert-modal-content ${typeClass}">
        ${icon ? `<div class="alert-modal-icon">${icon}</div>` : ''}
        <h2>${title}</h2>
        <p class="alert-modal-message">${message}</p>
        <div class="modal-actions">
          <button class="button ${type === 'success' ? 'button-primary' : type === 'error' ? 'button-danger' : ''} alert-modal-ok">${buttonText}</button>
        </div>
      </div>
    `;

    const cleanup = () => {
      modal.remove();
      resolve();
    };

    // OK button
    modal.querySelector('.alert-modal-ok')?.addEventListener('click', cleanup);

    // Click outside to dismiss
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cleanup();
      }
    });

    // Enter or Escape key to dismiss
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        document.removeEventListener('keydown', handleKeydown);
        cleanup();
      }
    };
    document.addEventListener('keydown', handleKeydown);

    document.body.appendChild(modal);

    // Focus the OK button for accessibility
    (modal.querySelector('.alert-modal-ok') as HTMLButtonElement)?.focus();
  });
}
