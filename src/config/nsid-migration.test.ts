import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateOwnerNsidRecordsImpl } from './nsid-migration';

type CollectionSet = {
  CONFIG_COLLECTION: string;
  SECTION_COLLECTION: string;
  LAYOUT_COLLECTION: string;
  SPECIAL_SPORE_COLLECTION: string;
  PROFILE_COLLECTION: string;
  CONTENT_TEXT_COLLECTION: string;
};

const DID = 'did:plc:testowner';

const OLD: CollectionSet = {
  CONFIG_COLLECTION: 'garden.spores.site.config',
  SECTION_COLLECTION: 'garden.spores.site.section',
  LAYOUT_COLLECTION: 'garden.spores.site.layout',
  SPECIAL_SPORE_COLLECTION: 'garden.spores.item.specialSpore',
  PROFILE_COLLECTION: 'garden.spores.site.profile',
  CONTENT_TEXT_COLLECTION: 'garden.spores.content.text',
};

const NEW: CollectionSet = {
  CONFIG_COLLECTION: 'coop.hypha.spores.site.config',
  SECTION_COLLECTION: 'coop.hypha.spores.site.section',
  LAYOUT_COLLECTION: 'coop.hypha.spores.site.layout',
  SPECIAL_SPORE_COLLECTION: 'coop.hypha.spores.item.specialSpore',
  PROFILE_COLLECTION: 'coop.hypha.spores.site.profile',
  CONTENT_TEXT_COLLECTION: 'coop.hypha.spores.content.text',
};

function getCollection(key: string, namespace: 'old' | 'new' = 'old'): string {
  const map: Record<string, string> = {
    siteConfig: namespace === 'new' ? NEW.CONFIG_COLLECTION : OLD.CONFIG_COLLECTION,
    siteLayout: namespace === 'new' ? NEW.LAYOUT_COLLECTION : OLD.LAYOUT_COLLECTION,
    siteSection: namespace === 'new' ? NEW.SECTION_COLLECTION : OLD.SECTION_COLLECTION,
    siteProfile: namespace === 'new' ? NEW.PROFILE_COLLECTION : OLD.PROFILE_COLLECTION,
    contentText: namespace === 'new' ? NEW.CONTENT_TEXT_COLLECTION : OLD.CONTENT_TEXT_COLLECTION,
    itemSpecialSpore: namespace === 'new' ? NEW.SPECIAL_SPORE_COLLECTION : OLD.SPECIAL_SPORE_COLLECTION,
  };
  return map[key] || key;
}

function makeDeps(overrides: Record<string, any> = {}) {
  return {
    isLoggedIn: vi.fn(() => true),
    getCurrentDid: vi.fn(() => DID),
    getCollection: vi.fn(getCollection),
    SPORE_COLLECTION_KEYS: ['siteConfig', 'siteLayout', 'siteSection', 'siteProfile', 'contentText', 'itemSpecialSpore'],
    getRecord: vi.fn(async () => null),
    putRecord: vi.fn(async () => ({})),
    deleteRecord: vi.fn(async () => ({})),
    listRecords: vi.fn(async () => ({ records: [] })),
    rewriteRecordPayloadForNamespace: vi.fn((_: string, value: any) => value),
    CONFIG_RKEY: 'self',
    debugLog: vi.fn(),
    ...overrides,
  };
}

describe('migrateOwnerNsidRecordsImpl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips when caller is not owner', async () => {
    const deps = makeDeps({
      getCurrentDid: vi.fn(() => 'did:plc:someone-else'),
    });

    await migrateOwnerNsidRecordsImpl(DID, deps);

    expect(deps.getRecord).not.toHaveBeenCalled();
    expect(deps.putRecord).not.toHaveBeenCalled();
    expect(deps.deleteRecord).not.toHaveBeenCalled();
    expect(deps.listRecords).not.toHaveBeenCalled();
  });

  it('skips writes when new singleton records already exist', async () => {
    const deps = makeDeps({
      getRecord: vi.fn(async (_did: string, collection: string) => {
        if (collection === NEW.CONFIG_COLLECTION) {
          return { value: { $type: NEW.CONFIG_COLLECTION, title: 'New Title' } };
        }
        return null;
      }),
    });

    await migrateOwnerNsidRecordsImpl(DID, deps);

    expect(deps.putRecord).not.toHaveBeenCalled();
    expect(deps.deleteRecord).not.toHaveBeenCalled();
    expect(deps.listRecords).toHaveBeenCalledTimes(3);
  });

  it('migrates paginated old records and singleton records', async () => {
    const deps = makeDeps({
      listRecords: vi.fn(async (_did: string, collection: string, options?: { cursor?: string }) => {
        if (collection !== OLD.SECTION_COLLECTION) return { records: [] };
        if (!options?.cursor) {
          return {
            records: [
              {
                uri: `at://${DID}/${OLD.SECTION_COLLECTION}/first`,
                value: { $type: OLD.SECTION_COLLECTION, type: 'content' },
              },
            ],
            cursor: 'page-2',
          };
        }
        return {
          records: [
            {
              uri: `at://${DID}/${OLD.SECTION_COLLECTION}/second`,
              value: { $type: OLD.SECTION_COLLECTION, type: 'content' },
            },
          ],
        };
      }),
      getRecord: vi.fn(async (_did: string, collection: string) => {
        if (collection === NEW.CONFIG_COLLECTION) return null;
        if (collection === OLD.CONFIG_COLLECTION) return { value: { title: 'Legacy Title', subtitle: 'Legacy Subtitle' } };
        return null;
      }),
    });

    await migrateOwnerNsidRecordsImpl(DID, deps);

    expect(deps.putRecord).toHaveBeenCalledWith(
      NEW.SECTION_COLLECTION,
      'first',
      expect.objectContaining({ $type: NEW.SECTION_COLLECTION })
    );
    expect(deps.putRecord).toHaveBeenCalledWith(
      NEW.SECTION_COLLECTION,
      'second',
      expect.objectContaining({ $type: NEW.SECTION_COLLECTION })
    );
    expect(deps.putRecord).toHaveBeenCalledWith(
      NEW.CONFIG_COLLECTION,
      'self',
      expect.objectContaining({
        $type: NEW.CONFIG_COLLECTION,
        title: 'Legacy Title',
      })
    );
    expect(deps.deleteRecord).toHaveBeenCalledWith(OLD.CONFIG_COLLECTION, 'self');
  });

  it('does not rewrite multi-record collections when new namespace already contains the same rkeys', async () => {
    const deps = makeDeps({
      listRecords: vi.fn(async (_did: string, collection: string) => {
        if (collection === OLD.SECTION_COLLECTION) {
          return {
            records: [
              {
                uri: `at://${DID}/${OLD.SECTION_COLLECTION}/same-rkey`,
                value: { $type: OLD.SECTION_COLLECTION, type: 'content' },
              },
            ],
          };
        }
        if (collection === NEW.SECTION_COLLECTION) {
          return {
            records: [
              {
                uri: `at://${DID}/${NEW.SECTION_COLLECTION}/same-rkey`,
                value: { $type: NEW.SECTION_COLLECTION, type: 'content' },
              },
            ],
          };
        }
        return { records: [] };
      }),
    });

    await migrateOwnerNsidRecordsImpl(DID, deps);

    expect(deps.putRecord).not.toHaveBeenCalled();
    expect(deps.deleteRecord).toHaveBeenCalledWith(OLD.SECTION_COLLECTION, 'same-rkey');
  });

  it('keeps old singleton record when existing new singleton payload differs', async () => {
    const deps = makeDeps({
      getRecord: vi.fn(async (_did: string, collection: string) => {
        if (collection === OLD.CONFIG_COLLECTION) {
          return { value: { title: 'Old Title', subtitle: 'Keep me' } };
        }
        if (collection === NEW.CONFIG_COLLECTION) {
          return { value: { $type: NEW.CONFIG_COLLECTION, title: 'New Title', subtitle: 'Different' } };
        }
        return null;
      }),
    });

    await migrateOwnerNsidRecordsImpl(DID, deps);

    expect(deps.putRecord).not.toHaveBeenCalled();
    expect(deps.deleteRecord).not.toHaveBeenCalledWith(OLD.CONFIG_COLLECTION, 'self');
  });

  it('keeps old list record when existing new record payload differs', async () => {
    const deps = makeDeps({
      listRecords: vi.fn(async (_did: string, collection: string) => {
        if (collection === OLD.SECTION_COLLECTION) {
          return {
            records: [
              {
                uri: `at://${DID}/${OLD.SECTION_COLLECTION}/same-rkey`,
                value: { $type: OLD.SECTION_COLLECTION, type: 'content', title: 'Old payload' },
              },
            ],
          };
        }
        if (collection === NEW.SECTION_COLLECTION) {
          return {
            records: [
              {
                uri: `at://${DID}/${NEW.SECTION_COLLECTION}/same-rkey`,
                value: { $type: NEW.SECTION_COLLECTION, type: 'content', title: 'Different payload' },
              },
            ],
          };
        }
        return { records: [] };
      }),
    });

    await migrateOwnerNsidRecordsImpl(DID, deps);

    expect(deps.putRecord).not.toHaveBeenCalled();
    expect(deps.deleteRecord).not.toHaveBeenCalledWith(OLD.SECTION_COLLECTION, 'same-rkey');
  });

  it('stops paginating when cursor repeats to avoid infinite loops', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = makeDeps({
      listRecords: vi.fn(async (_did: string, collection: string) => {
        if (collection !== OLD.SECTION_COLLECTION) return { records: [] };
        return {
          records: [
            {
              uri: `at://${DID}/${OLD.SECTION_COLLECTION}/looped`,
              value: { $type: OLD.SECTION_COLLECTION, type: 'content' },
            },
          ],
          cursor: 'repeat-cursor',
        };
      }),
      getRecord: vi.fn(async (_did: string, collection: string) => {
        if (collection === NEW.CONFIG_COLLECTION) return null;
        if (collection === OLD.CONFIG_COLLECTION) return { value: { title: 'Legacy Title' } };
        return null;
      }),
    });

    await migrateOwnerNsidRecordsImpl(DID, deps);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Aborting pagination for garden.spores.site.section: repeated cursor')
    );
    warnSpy.mockRestore();
  });
});
