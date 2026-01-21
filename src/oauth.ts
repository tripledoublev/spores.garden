/**
 * OAuth wrapper for AT Protocol authentication using atcute
 *
 * Usage:
 *   import { initOAuth, login, logout, getAgent, isLoggedIn } from './oauth';
 *
 *   // On app load
 *   await initOAuth(config);
 *
 *   // To login
 *   await login('user.bsky.social');
 *
 *   // Check auth state
 *   if (isLoggedIn()) {
 *     const agent = getAgent();
 *     // use agent to create records
 *   }
 */

import {
  configureOAuth,
  defaultIdentityResolver,
  createAuthorizationUrl,
  finalizeAuthorization,
  OAuthUserAgent
} from '@atcute/oauth-browser-client';
import {
  XrpcHandleResolver,
  CompositeDidDocumentResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver
} from '@atcute/identity-resolver';
import { Client } from '@atcute/client';
import { getPdsEndpoint } from '@atcute/identity';
import type { OAuthConfig, OAuthSession, ATClientOptions } from './types';

const SESSION_STORAGE_KEY = 'spores_garden_oauth_session';

let oauthConfig: OAuthConfig | null = null;
let currentAgent: OAuthUserAgent | null = null;
let currentSession: OAuthSession | null = null;
let identityResolver: ReturnType<typeof defaultIdentityResolver> | null = null;

/**
 * Initialize OAuth configuration
 */
export async function initOAuth(config: OAuthConfig) {
  oauthConfig = config;

  // Configure identity resolver with the defaultIdentityResolver wrapper
  identityResolver = defaultIdentityResolver({
    handleResolver: new XrpcHandleResolver({
      serviceUrl: 'https://public.api.bsky.app'
    }),
    didDocumentResolver: new CompositeDidDocumentResolver({
      methods: {
        plc: new PlcDidDocumentResolver(),
        web: new WebDidDocumentResolver()
      }
    })
  });

  // Configure OAuth
  configureOAuth({
    metadata: {
      client_id: config.oauth.clientId,
      redirect_uri: config.oauth.redirectUri
    },
    identityResolver
  });

  // Check for OAuth callback first (takes precedence)
  await handleOAuthCallback();
  
  // If no callback and not logged in, try to restore session from storage
  if (!currentAgent && !currentSession) {
    await restoreSession();
  }
}

/**
 * Handle OAuth callback if present in URL
 */
async function handleOAuthCallback() {
  // Check both hash fragment and query parameters
  let params: URLSearchParams | null = null;
  let hadHash = false;
  
  // Try hash fragment first (OAuth implicit flow)
  if (location.hash.length > 1) {
    params = new URLSearchParams(location.hash.slice(1));
    hadHash = true;
  }
  // Fall back to query parameters (OAuth authorization code flow)
  else if (location.search.length > 1) {
    params = new URLSearchParams(location.search.slice(1));
  }
  
  if (!params || (!params.has('state') || (!params.has('code') && !params.has('error')))) {
    return;
  }

  // Check for error in callback
  if (params.has('error')) {
    const error = params.get('error');
    const errorDescription = params.get('error_description') || error;
    console.error('OAuth error in callback:', error, errorDescription);
    
    // Clean up URL
    history.replaceState(null, '', location.pathname);
    
    window.dispatchEvent(new CustomEvent('auth-error', {
      detail: { error: new Error(errorDescription || 'OAuth authorization failed') }
    }));
    return;
  }

  try {
    // Don't clean up URL until after successful authorization
    // This ensures state validation can access the URL if needed
    const result = await finalizeAuthorization(params) as { session: OAuthSession };
    const session = result.session as OAuthSession;
    currentSession = session;
    currentAgent = new OAuthUserAgent(session as unknown as OAuthSession);

    // Save session to sessionStorage for persistence across page refreshes
    saveSessionToStorage(session);

    // Clean up URL after successful authorization
    history.replaceState(null, '', location.pathname);

    // Dispatch event for UI to update
    window.dispatchEvent(new CustomEvent('auth-change', {
      detail: { loggedIn: true, did: currentSession.info.sub }
    }));
  } catch (error) {
    // Clean up URL even on error to prevent retry loops
    history.replaceState(null, '', location.pathname);
    
    // Check if it's a stale state error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('unknown state') || errorMessage.includes('state')) {
      console.warn('OAuth callback with stale state - this may be from a previous session. Ignoring.');
      // Don't dispatch error for stale states - user can try logging in again
      return;
    }
    
    console.error('OAuth callback failed:', error);
    window.dispatchEvent(new CustomEvent('auth-error', {
      detail: { error }
    }));
  }
}

/**
 * Start login flow
 */
export async function login(handle: string) {
  if (!oauthConfig) {
    throw new Error('OAuth not initialized');
  }

  const authUrl = await createAuthorizationUrl({
    target: { type: 'account', identifier: handle },
    scope: oauthConfig.oauth.scope || 'atproto transition:generic'
  });

  // Small delay to allow state persistence
  await new Promise(resolve => setTimeout(resolve, 200));

  // Redirect to auth
  window.location.assign(authUrl);
}

/**
 * Save session to sessionStorage
 */
function saveSessionToStorage(session: OAuthSession) {
  try {
    // Store session data in sessionStorage (clears when tab closes)
    // Serialize the session object - the atcute session should be JSON serializable
    // We'll store it as-is since we don't know all the internal properties
    const sessionAny = session as any;
    const sessionData: Record<string, unknown> = {
      info: session.info
    };
    
    // Store known OAuth session properties if they exist
    if (sessionAny.accessToken) sessionData.accessToken = sessionAny.accessToken;
    if (sessionAny.refreshToken) sessionData.refreshToken = sessionAny.refreshToken;
    if (sessionAny.expiresAt) sessionData.expiresAt = sessionAny.expiresAt;
    
    // Store any other enumerable properties (but skip functions)
    for (const key in sessionAny) {
      if (key !== 'info' && key !== 'accessToken' && key !== 'refreshToken' && key !== 'expiresAt') {
        const value = sessionAny[key];
        if (value !== undefined && typeof value !== 'function') {
          try {
            // Test if value is serializable
            JSON.stringify(value);
            sessionData[key] = value;
          } catch {
            // Skip non-serializable values
          }
        }
      }
    }
    
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
  } catch (error) {
    console.warn('Failed to save session to storage:', error);
    // Non-fatal - continue without persistence
  }
}

/**
 * Restore session from sessionStorage
 */
async function restoreSession() {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) {
      return; // No stored session
    }

    const sessionData = JSON.parse(stored);
    
    // Check if session is expired
    if (sessionData.expiresAt && new Date(sessionData.expiresAt).getTime() < Date.now()) {
      console.log('Stored session has expired, clearing');
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    // Reconstruct session object - cast to any to include all properties
    const restoredSession = sessionData as OAuthSession & {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: string | number;
    };

    // Recreate agent from restored session
    currentSession = restoredSession;
    currentAgent = new OAuthUserAgent(restoredSession as unknown as OAuthSession);

    // Dispatch event to notify UI
    window.dispatchEvent(new CustomEvent('auth-change', {
      detail: { loggedIn: true, did: restoredSession.info.sub }
    }));

    console.log('Restored session from storage');
  } catch (error) {
    console.warn('Failed to restore session from storage:', error);
    // Clear corrupted session data
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Logout
 */
export function logout() {
  currentAgent = null;
  currentSession = null;

  // Clear session from storage
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear session from storage:', error);
  }

  window.dispatchEvent(new CustomEvent('auth-change', {
    detail: { loggedIn: false, did: null }
  }));
}

/**
 * Check if user is logged in
 */
export function isLoggedIn() {
  return currentAgent !== null;
}

/**
 * Get current OAuth agent for making authenticated requests
 */
export function getAgent() {
  return currentAgent;
}

/**
 * Get current session info
 */
export function getSession() {
  return currentSession;
}

/**
 * Get current user's DID
 */
export function getCurrentDid() {
  return currentSession?.info?.sub || null;
}

/**
 * Create a record in the user's repo
 */
export async function createRecord(collection: string, record: unknown) {
  if (!currentAgent) {
    throw new Error('Not logged in');
  }
  if (!currentSession) {
    throw new Error('Missing OAuth session');
  }

  // Resolve PDS endpoint to ensure client uses correct service
  let pdsUrl: string | undefined;
  try {
    if (identityResolver) {
      const resolved = await identityResolver.resolve(currentSession.info.sub);
      if (resolved?.pds) {
        // Ensure URL is properly formatted (remove trailing slash if present)
        pdsUrl = resolved.pds.replace(/\/$/, '');
      }
    }
  } catch (error) {
    console.warn('Failed to resolve PDS for createRecord, client will use default:', error);
  }

  // Create client with explicit service URL if we have it
  const clientOptions: ATClientOptions = { handler: currentAgent };
  if (pdsUrl) {
    clientOptions.serviceUrl = pdsUrl;
  }

  const client = new Client(clientOptions);

  try {
    // Use post() for procedures (createRecord is a procedure)
    const response = await client.post('com.atproto.repo.createRecord', {
      input: {
        repo: currentSession.info.sub,
        collection,
        record
      }
    });

    if (!response.ok) {
      const errorMsg = response.data?.message || response.data?.error || 'Unknown error';
      throw new Error(`Failed to create record: ${errorMsg}`);
    }

    return response.data;
  } catch (error) {
    console.error('createRecord error:', error);
    throw error;
  }
}

/**
 * Update a record in the user's repo
 */
export async function putRecord(collection: string, rkey: string, record: unknown) {
  if (!currentAgent) {
    throw new Error('Not logged in');
  }
  if (!currentSession) {
    throw new Error('Missing OAuth session');
  }

  // Resolve PDS endpoint to ensure client uses correct service
  let pdsUrl: string | undefined;
  try {
    if (identityResolver) {
      const resolved = await identityResolver.resolve(currentSession.info.sub);
      if (resolved?.pds) {
        pdsUrl = resolved.pds;
      }
    }
  } catch (error) {
    console.warn('Failed to resolve PDS for putRecord, client will use default:', error);
  }

  // Create client with explicit service URL if we have it
  const clientOptions: ATClientOptions = { handler: currentAgent };
  if (pdsUrl) {
    clientOptions.serviceUrl = pdsUrl;
  }

  const client = new Client(clientOptions);

  // Use post() for procedures (putRecord is a procedure)
  const response = await client.post('com.atproto.repo.putRecord', {
    input: {
      repo: currentSession.info.sub,
      collection,
      rkey,
      record
    }
  });

  if (!response.ok) {
    const errorMsg = response.data?.message || response.data?.error || 'Unknown error';
    throw new Error(`Failed to update record: ${errorMsg}`);
  }

  return response.data;
}

/**
 * Delete a record from the user's repo
 */
export async function deleteRecord(collection: string, rkey: string) {
  if (!currentAgent) {
    throw new Error('Not logged in');
  }
  if (!currentSession) {
    throw new Error('Missing OAuth session');
  }

  // Resolve PDS endpoint to ensure client uses correct service
  let pdsUrl: string | undefined;
  try {
    if (identityResolver) {
      const resolved = await identityResolver.resolve(currentSession.info.sub);
      if (resolved?.pds) {
        pdsUrl = resolved.pds;
      }
    }
  } catch (error) {
    console.warn('Failed to resolve PDS for deleteRecord, client will use default:', error);
  }

  // Create client with explicit service URL if we have it
  const clientOptions: ATClientOptions = { handler: currentAgent };
  if (pdsUrl) {
    clientOptions.serviceUrl = pdsUrl;
  }

  const client = new Client(clientOptions);

  // Use post() for procedures (deleteRecord is a procedure)
  const response = await client.post('com.atproto.repo.deleteRecord', {
    input: {
      repo: currentSession.info.sub,
      collection,
      rkey
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const errorMsg = response.data?.message || response.data?.error || 'Unknown error';
    throw new Error(`Failed to delete record: ${errorMsg}`);
  }
  return response.data;
}

/**
 * Publish a post to Bluesky
 */
export async function post(record: unknown) {
  if (!currentAgent) {
    throw new Error('Not logged in');
  }
  if (!currentSession) {
    throw new Error('Missing OAuth session');
  }

  // Resolve PDS endpoint to ensure we use the correct service
  let pdsUrl: string | undefined;
  try {
    if (identityResolver) {
      const resolved = await identityResolver.resolve(currentSession.info.sub);
      if (resolved?.pds) {
        pdsUrl = resolved.pds;
      }
    }
  } catch (error) {
    console.warn('Failed to resolve PDS for post, client will use default:', error);
  }

  // Create client with explicit service URL if we have it
  const clientOptions: ATClientOptions = { handler: currentAgent };
  if (pdsUrl) {
    clientOptions.serviceUrl = pdsUrl;
  }

  const client = new Client(clientOptions);

  // Use post() for procedures (com.atproto.repo.createRecord is a procedure)
  const response = await client.post('com.atproto.repo.createRecord', {
    input: {
      repo: currentSession.info.sub,
      collection: 'app.bsky.feed.post',
      record: record
    }
  });

  if (!response.ok) {
    const errorMsg = response.data?.message || response.data?.error || 'Unknown error';
    throw new Error(`Failed to create post: ${errorMsg}`);
  }

  return response.data;
}

/**
 * Upload a blob (e.g., image) to the PDS
 * 
 * Blob uploads require raw binary data as the request body, which is different
 * from typical JSON API calls. We use the OAuthUserAgent.handle() method which
 * automatically handles DPoP authentication required by AT Protocol OAuth.
 */
export async function uploadBlob(blob: Blob, mimeType: string) {
  if (!currentAgent) {
    throw new Error('Not logged in');
  }
  if (!currentSession) {
    throw new Error('Missing OAuth session');
  }

  // Use the OAuthUserAgent.handle() method which automatically handles
  // DPoP authentication (AT Protocol OAuth doesn't use simple Bearer tokens)
  try {
    const response = await currentAgent.handle('/xrpc/com.atproto.repo.uploadBlob', {
      method: 'POST',
      headers: {
        'Content-Type': mimeType
      },
      body: blob
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.message || errorData.error || `HTTP ${response.status}`;
      throw new Error(`Failed to upload blob: ${errorMsg}`);
    }

    const data = await response.json();
    
    // Return response in the same format as other functions (with ok and data properties)
    return {
      ok: true,
      data: data
    };
  } catch (error) {
    console.error('uploadBlob error:', error);
    throw error;
  }
}