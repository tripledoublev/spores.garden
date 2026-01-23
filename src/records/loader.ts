/**
 * Record loader - fetches all records from a PDS
 *
 * Loads all collections and their records for browsing/selection
 */

import { describeRepo, listRecords, getRecord, parseAtUri } from '../at-client';
import { getAgent } from '../oauth';

/**
 * Cache for loaded records
 */
const recordCache = new Map();
const collectionCache = new Map();

/**
 * Get all collections for a DID
 */
export async function getCollections(did) {
  if (collectionCache.has(did)) {
    return collectionCache.get(did);
  }

  try {
    const agent = getAgent();
    const repo = await describeRepo(did, agent);
    if (!repo) {
      throw new Error('No repository data returned');
    }

    const collections = repo.collections || [];

    if (!Array.isArray(collections)) {
      console.warn('Collections is not an array:', collections);
      return [];
    }

    collectionCache.set(did, collections);
    return collections;
  } catch (error) {
    console.error('Error in getCollections:', error);
    // Clear cache on error to allow retry
    collectionCache.delete(did);
    throw error;
  }
}

/**
 * Get records from a collection
 * 
 * By default, only loads a single page of records to avoid loading everything.
 * Set options.loadAll = true to paginate through all records.
 */
export async function getCollectionRecords(did: string, collection: string, options: { refresh?: boolean; loadAll?: boolean; limit?: number; maxRecords?: number } = {}) {
  if (!did) {
    throw new Error('DID is required');
  }
  if (!collection) {
    throw new Error('Collection is required');
  }

  const cacheKey = `${did}:${collection}`;

  // Return cached if not forcing refresh
  if (!options.refresh && recordCache.has(cacheKey)) {
    return recordCache.get(cacheKey);
  }

  try {
    // Try to use authenticated agent if available
    const agent = getAgent();
    const allRecords = [];
    let cursor = null;

    // Default to single page unless explicitly requested to load all
    const shouldPaginate = options.loadAll === true;

    do {
      const response = await listRecords(did, collection, {
        limit: options.limit || 100,
        cursor
      }, agent);

      if (!response.records || !Array.isArray(response.records)) {
        console.warn('Invalid records array in response:', response);
        break;
      }

      allRecords.push(...response.records);
      cursor = response.cursor;

      // Respect max limit if set
      if (options.maxRecords && allRecords.length >= options.maxRecords) {
        break;
      }
    } while (cursor && shouldPaginate);

    recordCache.set(cacheKey, allRecords);
    return allRecords;
  } catch (error) {
    console.error('Error in getCollectionRecords:', error);
    // Clear cache on error to allow retry
    recordCache.delete(cacheKey);
    throw error;
  }
}

/**
 * Get a single record by AT URI
 */
export async function getRecordByUri(uri) {
  const parsed = parseAtUri(uri);
  if (!parsed) {
    throw new Error(`Invalid AT URI: ${uri}`);
  }

  const { did, collection, rkey } = parsed;
  const cacheKey = uri;

  if (recordCache.has(cacheKey)) {
    return recordCache.get(cacheKey);
  }

  const record = await getRecord(did, collection, rkey);
  if (record) {
    recordCache.set(cacheKey, record);
  }

  return record;
}

/**
 * Get multiple records by their AT URIs
 */
export async function getRecordsByUris(uris) {
  const results = await Promise.all(
    uris.map(async uri => {
      try {
        return await getRecordByUri(uri);
      } catch (error) {
        console.warn(`Failed to fetch record ${uri}:`, error);
        return null;
      }
    })
  );

  return results.filter(Boolean);
}

/**
 * Get all records across all collections for a DID
 */
export async function getAllRecords(did: string, options: { includeSystem?: boolean; refresh?: boolean; loadAll?: boolean; limit?: number; maxRecords?: number } = {}) {
  const collections = await getCollections(did);
  const allRecords = [];

  for (const collection of collections) {
    // Skip system collections unless requested
    if (!options.includeSystem && collection.startsWith('app.bsky.actor.')) {
      continue;
    }

    try {
      const records = await getCollectionRecords(did, collection, {
        ...options
        // Defaults to single page to avoid loading everything (no loadAll flag)
      });

      for (const record of records) {
        allRecords.push({
          ...record,
          collection,
          did
        });
      }
    } catch (error) {
      console.warn(`Failed to load collection ${collection}:`, error);
    }
  }

  return allRecords;
}

/**
 * Group records by collection
 */
export function groupByCollection(records) {
  const groups = new Map();

  for (const record of records) {
    const collection = record.collection || record.uri?.split('/')[3];
    if (!collection) continue;

    if (!groups.has(collection)) {
      groups.set(collection, []);
    }
    groups.get(collection).push(record);
  }

  return groups;
}

/**
 * Clear cache for a DID
 */
export function clearCache(did) {
  // Clear collection cache
  collectionCache.delete(did);

  // Clear record caches for this DID
  for (const key of recordCache.keys()) {
    if (key.startsWith(did) || key.startsWith(`at://${did}`)) {
      recordCache.delete(key);
    }
  }
}

/**
 * Clear all caches
 */
export function clearAllCaches() {
  recordCache.clear();
  collectionCache.clear();
}
