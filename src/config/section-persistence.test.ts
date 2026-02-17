import { describe, expect, it } from 'vitest';
import {
  buildSectionRecordForSave,
  normalizeSectionForNamespace,
  rewriteRecordPayloadForNamespace,
} from './section-persistence';

describe('section persistence helpers', () => {
  it('normalizes legacy section refs/collections into target namespace', () => {
    const did = 'did:plc:test123';
    const section = {
      type: 'content',
      collection: 'garden.spores.content.text',
      rkey: 'abc123',
      records: ['at://did:plc:other/garden.spores.content.text/xyz999'],
    };

    const normalized = normalizeSectionForNamespace(section, 'new', did);

    expect(normalized.collection).toBe('coop.hypha.spores.content.text');
    expect(normalized.ref).toBe('at://did:plc:test123/coop.hypha.spores.content.text/abc123');
    expect(normalized.records).toEqual(['at://did:plc:other/coop.hypha.spores.content.text/xyz999']);
  });

  it('rewrites layout record payload uris to target namespace', () => {
    const rewritten = rewriteRecordPayloadForNamespace(
      'garden.spores.site.layout',
      {
        $type: 'garden.spores.site.layout',
        sections: ['at://did:plc:test123/garden.spores.site.section/one'],
      },
      'new'
    );

    expect(rewritten.$type).toBe('coop.hypha.spores.site.layout');
    expect(rewritten.sections).toEqual(['at://did:plc:test123/coop.hypha.spores.site.section/one']);
  });

  it('builds section record payload with optional fields omitted', () => {
    const payload = buildSectionRecordForSave(
      {
        type: 'content',
        title: '',
        layout: '',
        ref: 'at://did:plc:test123/coop.hypha.spores.content.text/abc123',
      },
      'coop.hypha.spores.site.section'
    );

    expect(payload.$type).toBe('coop.hypha.spores.site.section');
    expect(payload.type).toBe('content');
    expect(payload.title).toBeUndefined();
    expect(payload.layout).toBeUndefined();
    expect(payload.ref).toBe('at://did:plc:test123/coop.hypha.spores.content.text/abc123');
  });
});
