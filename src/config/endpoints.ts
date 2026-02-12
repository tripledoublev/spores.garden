/**
 * External Service Endpoints
 *
 * Centralizes URLs for external services used by the app.
 * Can be overridden via environment variables for different deployments.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env: Record<string, string | undefined> = (import.meta as any).env || {};

export const ENDPOINTS = {
  /** Slingshot - AT Protocol record cache */
  SLINGSHOT_URL: env.VITE_SLINGSHOT_URL || 'https://slingshot.wisp.place',

  /** Constellation - AT Protocol backlink service */
  CONSTELLATION_URL: env.VITE_CONSTELLATION_URL || 'https://constellation.microcosm.blue',

  /** Bluesky public API */
  BLUESKY_API_URL: env.VITE_BLUESKY_API_URL || 'https://public.api.bsky.app',

  /** AT Protocol relay (for sync endpoints like listReposByCollection) */
  RELAY_URL: env.VITE_RELAY_URL || 'https://relay1.us-east.bsky.network'
} as const;
