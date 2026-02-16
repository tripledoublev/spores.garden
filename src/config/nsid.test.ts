import { describe, expect, it } from 'vitest';
import {
  getCollection,
  getReadNamespaces,
  getWriteNamespace,
  mapCollectionToNamespace,
  rewriteAtUriNamespace,
  setNsidMigrationEnabledForTests,
} from './nsid';

describe('nsid helpers', () => {
  it('switches write/read behavior when migration flag is enabled', () => {
    setNsidMigrationEnabledForTests(false);
    expect(getWriteNamespace()).toBe('old');
    expect(getReadNamespaces()).toEqual(['old']);

    setNsidMigrationEnabledForTests(true);
    expect(getWriteNamespace()).toBe('new');
    expect(getReadNamespaces()).toEqual(['new', 'old']);

    setNsidMigrationEnabledForTests(false);
  });

  it('rewrites collection names and AT URIs across namespaces', () => {
    const oldContent = getCollection('contentText', 'old');
    const newContent = getCollection('contentText', 'new');

    expect(mapCollectionToNamespace(oldContent, 'new')).toBe(newContent);
    expect(mapCollectionToNamespace(newContent, 'old')).toBe(oldContent);

    const oldUri = `at://did:plc:test/${oldContent}/rkey1`;
    const newUri = rewriteAtUriNamespace(oldUri, 'new');
    expect(newUri).toBe(`at://did:plc:test/${newContent}/rkey1`);
  });
});
