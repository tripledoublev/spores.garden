type CollectionSet = {
  CONFIG_COLLECTION: string;
  SECTION_COLLECTION: string;
  LAYOUT_COLLECTION: string;
  SPECIAL_SPORE_COLLECTION: string;
  PROFILE_COLLECTION: string;
  CONTENT_TEXT_COLLECTION: string;
};

type ListRecordsFn = (
  did: string,
  collection: string,
  options?: { limit?: number; cursor?: string }
) => Promise<{ records?: any[]; cursor?: string }>;

async function listAllRecordsForCollection(
  did: string,
  collection: string,
  listRecords: ListRecordsFn
): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | undefined = undefined;
  for (;;) {
    const response = await listRecords(did, collection, { limit: 100, cursor });
    const records = response?.records || [];
    all.push(...records);
    if (!response?.cursor) break;
    cursor = response.cursor;
  }
  return all;
}

export async function migrateOwnerNsidRecordsImpl(
  did: string,
  deps: {
    isNsidMigrationEnabled: () => boolean;
    isLoggedIn: () => boolean;
    getCurrentDid: () => string | null;
    getCollections: (namespace: 'old' | 'new') => CollectionSet;
    getCollection: (key: string, namespace?: 'old' | 'new') => string;
    SPORE_COLLECTION_KEYS: string[];
    getRecord: (did: string, collection: string, rkey: string) => Promise<any>;
    putRecord: (collection: string, rkey: string, value: any) => Promise<any>;
    listRecords: ListRecordsFn;
    rewriteRecordPayloadForNamespace: (collection: string, value: any, namespace: 'old' | 'new') => any;
    CONFIG_RKEY: string;
    NSID_MIGRATION_VERSION: number;
    debugLog: (...args: unknown[]) => void;
  }
): Promise<void> {
  if (!deps.isNsidMigrationEnabled()) return;
  if (!deps.isLoggedIn() || deps.getCurrentDid() !== did) return;

  const newCollections = deps.getCollections('new');
  const oldCollections = deps.getCollections('old');

  try {
    const existingNewConfig = await deps.getRecord(did, newCollections.CONFIG_COLLECTION, deps.CONFIG_RKEY);
    if (existingNewConfig?.value?.nsidMigrationVersion >= deps.NSID_MIGRATION_VERSION) {
      return;
    }

    for (const key of deps.SPORE_COLLECTION_KEYS) {
      const oldCollection = deps.getCollection(key, 'old');
      const newCollection = deps.getCollection(key, 'new');

      if (key === 'siteConfig' || key === 'siteLayout' || key === 'siteProfile') {
        const oldRecord = await deps.getRecord(did, oldCollection, deps.CONFIG_RKEY);
        if (!oldRecord?.value) continue;
        const rewritten = deps.rewriteRecordPayloadForNamespace(oldCollection, oldRecord.value, 'new');
        await deps.putRecord(newCollection, deps.CONFIG_RKEY, {
          ...rewritten,
          $type: newCollection,
        });
        continue;
      }

      const oldRecords = await listAllRecordsForCollection(did, oldCollection, deps.listRecords);
      for (const record of oldRecords) {
        const rkey = record?.uri?.split('/').pop();
        if (!rkey || !record?.value) continue;
        const rewritten = deps.rewriteRecordPayloadForNamespace(oldCollection, record.value, 'new');
        await deps.putRecord(newCollection, rkey, {
          ...rewritten,
          $type: newCollection,
        });
      }
    }

    const latestNewConfig = await deps.getRecord(did, newCollections.CONFIG_COLLECTION, deps.CONFIG_RKEY);
    const oldConfig = await deps.getRecord(did, oldCollections.CONFIG_COLLECTION, deps.CONFIG_RKEY);
    const baseConfig = latestNewConfig?.value || oldConfig?.value || {
      title: 'My Garden',
      subtitle: '',
    };

    await deps.putRecord(newCollections.CONFIG_COLLECTION, deps.CONFIG_RKEY, {
      ...baseConfig,
      $type: newCollections.CONFIG_COLLECTION,
      nsidMigrationVersion: deps.NSID_MIGRATION_VERSION,
    });
    deps.debugLog(`[nsid-migration] Completed migration for ${did}`);
  } catch (error) {
    console.error(`[nsid-migration] Failed migration for ${did}:`, error);
  }
}

export async function migrateLegacySectionsRecordImpl(
  did: string,
  deps: {
    isLoggedIn: () => boolean;
    getCurrentDid: () => string | null;
    getCollections: () => CollectionSet;
    getRecord: (did: string, collection: string, rkey: string) => Promise<any>;
    createRecord: (collection: string, value: any) => Promise<{ uri: string }>;
    putRecord: (collection: string, rkey: string, value: any) => Promise<any>;
    deleteRecord: (collection: string, rkey: string) => Promise<any>;
    CONFIG_RKEY: string;
    debugLog: (...args: unknown[]) => void;
  }
): Promise<void> {
  if (!deps.isLoggedIn() || deps.getCurrentDid() !== did) {
    deps.debugLog(`Skipping migration for ${did}: Not logged in or not owner.`);
    return;
  }
  const OLD_SECTIONS_COLLECTION = 'garden.spores.site.sections';
  const collections = deps.getCollections();

  try {
    const oldSectionsRecord = await deps.getRecord(did, OLD_SECTIONS_COLLECTION, deps.CONFIG_RKEY);
    if (oldSectionsRecord && oldSectionsRecord.value && oldSectionsRecord.value.sections) {
      deps.debugLog(`Migrating old sections record for user: ${did}`);

      const sections = oldSectionsRecord.value.sections as any[];
      const sectionUris: string[] = [];

      for (const section of sections) {
        const sectionRecord = {
          $type: collections.SECTION_COLLECTION,
          type: section.type,
          title: section.title || undefined,
          layout: section.layout || undefined,
          collection: section.collection || undefined,
          rkey: section.rkey || undefined,
          records: section.records || undefined,
          content: section.content || undefined,
          format: section.format || undefined,
          limit: section.limit || undefined,
          hideHeader: section.hideHeader || undefined,
        };

        const response = await deps.createRecord(collections.SECTION_COLLECTION, sectionRecord);
        sectionUris.push(response.uri);
      }

      const layoutRecord = {
        $type: collections.LAYOUT_COLLECTION,
        sections: sectionUris,
      };
      await deps.putRecord(collections.LAYOUT_COLLECTION, deps.CONFIG_RKEY, layoutRecord);

      await deps.deleteRecord(OLD_SECTIONS_COLLECTION, deps.CONFIG_RKEY);
      deps.debugLog(`Migration successful for user: ${did}`);
    }
  } catch (error: any) {
    if (error?.message?.includes('not found')) {
      // expected: already migrated or new user
    } else {
      console.error(`Error during sections migration check for user ${did}:`, error);
    }
  }
}
