const DEBUG_QUERY_PARAM = 'debug';
const DEBUG_STORAGE_KEY = 'spores.garden.debug';

function queryDebugEnabled(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get(DEBUG_QUERY_PARAM);
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}

function storageDebugEnabled(): boolean {
  try {
    return localStorage.getItem(DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isDebugLoggingEnabled(): boolean {
  return queryDebugEnabled() || storageDebugEnabled();
}

export function debugLog(...args: unknown[]): void {
  if (isDebugLoggingEnabled()) {
    console.log(...args);
  }
}
