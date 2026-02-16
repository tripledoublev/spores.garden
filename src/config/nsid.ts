export type NsidNamespace = 'old' | 'new';

export const NSID_MIGRATION_VERSION = 1;

// Keep this disabled until launch cutover testing is explicitly enabled.
let nsidMigrationEnabled = false;

export const OLD_NSID_PREFIX = 'garden.spores';
export const NEW_NSID_PREFIX = 'coop.hypha.spores';

export type SporeCollectionKey =
  | 'siteConfig'
  | 'siteLayout'
  | 'siteSection'
  | 'siteProfile'
  | 'contentText'
  | 'contentImage'
  | 'socialFlower'
  | 'socialTakenFlower'
  | 'itemSpecialSpore';

export const SPORE_COLLECTION_KEYS: SporeCollectionKey[] = [
  'siteConfig',
  'siteLayout',
  'siteSection',
  'siteProfile',
  'contentText',
  'contentImage',
  'socialFlower',
  'socialTakenFlower',
  'itemSpecialSpore',
];

type CollectionSet = Record<SporeCollectionKey, string>;

export const OLD_COLLECTIONS: CollectionSet = {
  siteConfig: `${OLD_NSID_PREFIX}.site.config`,
  siteLayout: `${OLD_NSID_PREFIX}.site.layout`,
  siteSection: `${OLD_NSID_PREFIX}.site.section`,
  siteProfile: `${OLD_NSID_PREFIX}.site.profile`,
  contentText: `${OLD_NSID_PREFIX}.content.text`,
  contentImage: `${OLD_NSID_PREFIX}.content.image`,
  socialFlower: `${OLD_NSID_PREFIX}.social.flower`,
  socialTakenFlower: `${OLD_NSID_PREFIX}.social.takenFlower`,
  itemSpecialSpore: `${OLD_NSID_PREFIX}.item.specialSpore`,
};

export const NEW_COLLECTIONS: CollectionSet = {
  siteConfig: `${NEW_NSID_PREFIX}.site.config`,
  siteLayout: `${NEW_NSID_PREFIX}.site.layout`,
  siteSection: `${NEW_NSID_PREFIX}.site.section`,
  siteProfile: `${NEW_NSID_PREFIX}.site.profile`,
  contentText: `${NEW_NSID_PREFIX}.content.text`,
  contentImage: `${NEW_NSID_PREFIX}.content.image`,
  socialFlower: `${NEW_NSID_PREFIX}.social.flower`,
  socialTakenFlower: `${NEW_NSID_PREFIX}.social.takenFlower`,
  itemSpecialSpore: `${NEW_NSID_PREFIX}.item.specialSpore`,
};

const OLD_TO_NEW = new Map<string, string>(
  Object.keys(OLD_COLLECTIONS).map((k) => {
    const key = k as SporeCollectionKey;
    return [OLD_COLLECTIONS[key], NEW_COLLECTIONS[key]];
  })
);

const NEW_TO_OLD = new Map<string, string>(
  Object.keys(NEW_COLLECTIONS).map((k) => {
    const key = k as SporeCollectionKey;
    return [NEW_COLLECTIONS[key], OLD_COLLECTIONS[key]];
  })
);

export function isNsidMigrationEnabled(): boolean {
  return nsidMigrationEnabled;
}

export function getWriteNamespace(): NsidNamespace {
  return nsidMigrationEnabled ? 'new' : 'old';
}

export function getReadNamespaces(): NsidNamespace[] {
  return nsidMigrationEnabled ? ['new', 'old'] : ['old'];
}

export function setNsidMigrationEnabledForTests(enabled: boolean): void {
  nsidMigrationEnabled = enabled;
}

export function getCollection(key: SporeCollectionKey, namespace: NsidNamespace = getWriteNamespace()): string {
  return namespace === 'new' ? NEW_COLLECTIONS[key] : OLD_COLLECTIONS[key];
}

export function getReadCollections(key: SporeCollectionKey): string[] {
  return getReadNamespaces().map((ns) => getCollection(key, ns));
}

export function mapCollectionToNamespace(collection: string, namespace: NsidNamespace): string {
  if (!collection) return collection;
  if (namespace === 'new') return OLD_TO_NEW.get(collection) || collection;
  return NEW_TO_OLD.get(collection) || collection;
}

export function isSporeCollection(collection: string): boolean {
  return OLD_TO_NEW.has(collection) || NEW_TO_OLD.has(collection);
}

export function rewriteAtUriNamespace(uri: string, namespace: NsidNamespace): string {
  if (!uri || !uri.startsWith('at://')) return uri;
  const parts = uri.split('/');
  if (parts.length < 5) return uri;
  const mappedCollection = mapCollectionToNamespace(parts[3], namespace);
  if (mappedCollection === parts[3]) return uri;
  parts[3] = mappedCollection;
  return parts.join('/');
}

export function rewriteAtUrisNamespace(uris: string[] | undefined, namespace: NsidNamespace): string[] | undefined {
  if (!Array.isArray(uris)) return uris;
  return uris.map((u) => rewriteAtUriNamespace(u, namespace));
}

export function getBacklinkQueries(key: SporeCollectionKey, field: string): string[] {
  return getReadCollections(key).map((collection) => `${collection}:${field}`);
}

export function isContentTextCollection(collection: string | undefined): boolean {
  if (!collection) return false;
  return collection === OLD_COLLECTIONS.contentText || collection === NEW_COLLECTIONS.contentText;
}

export function isContentImageCollection(collection: string | undefined): boolean {
  if (!collection) return false;
  return collection === OLD_COLLECTIONS.contentImage || collection === NEW_COLLECTIONS.contentImage;
}

export function isProfileCollection(collection: string | undefined): boolean {
  if (!collection) return false;
  return collection === OLD_COLLECTIONS.siteProfile || collection === NEW_COLLECTIONS.siteProfile;
}
