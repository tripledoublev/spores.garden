/**
 * Input Validation Utilities
 *
 * Provides validation for user inputs before saving to PDS.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string;
}

/**
 * Validate site title
 */
export function validateTitle(title: string): ValidationResult {
  if (!title) return { valid: true, sanitized: '' };

  const trimmed = title.trim();
  if (trimmed.length > 100) {
    return { valid: false, error: 'Title must be 100 characters or less' };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate site subtitle
 */
export function validateSubtitle(subtitle: string): ValidationResult {
  if (!subtitle) return { valid: true, sanitized: '' };

  const trimmed = subtitle.trim();
  if (trimmed.length > 200) {
    return { valid: false, error: 'Subtitle must be 200 characters or less' };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate content block
 */
export function validateContent(content: string, maxLength = 50000): ValidationResult {
  if (!content) {
    return { valid: false, error: 'Content is required' };
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Content cannot be empty' };
  }

  if (trimmed.length > maxLength) {
    return { valid: false, error: `Content must be ${maxLength} characters or less` };
  }

  return { valid: true, sanitized: trimmed };
}


