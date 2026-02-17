import { buildAtUri, parseAtUri } from '../at-client';
import { mapCollectionToNamespace, rewriteAtUriNamespace, rewriteAtUrisNamespace } from './nsid';

export function getSectionReference(section: any): { collection?: string; rkey?: string } {
  const parsed = section?.ref ? parseAtUri(section.ref) : null;
  return {
    collection: parsed?.collection || section?.collection,
    rkey: parsed?.rkey || section?.rkey,
  };
}

export function normalizeSectionForNamespace(section: any, namespace: 'old' | 'new', did?: string): any {
  if (!section) return section;
  const normalized = { ...section };

  if (normalized.ref) {
    normalized.ref = rewriteAtUriNamespace(normalized.ref, namespace);
  }
  if (Array.isArray(normalized.records)) {
    normalized.records = rewriteAtUrisNamespace(normalized.records, namespace);
  }
  if (normalized.collection) {
    normalized.collection = mapCollectionToNamespace(normalized.collection, namespace);
  }

  const sectionRef = getSectionReference(normalized);
  if (did && sectionRef.collection && sectionRef.rkey && !normalized.ref) {
    normalized.ref = buildAtUri(did, sectionRef.collection, sectionRef.rkey);
  }

  return normalized;
}

export function rewriteRecordPayloadForNamespace(collection: string, value: any, namespace: 'old' | 'new'): any {
  if (!value || typeof value !== 'object') return value;
  const rewritten = { ...value };

  if (rewritten.$type && typeof rewritten.$type === 'string') {
    rewritten.$type = mapCollectionToNamespace(rewritten.$type, namespace);
  }

  if (collection.endsWith('.site.layout') && Array.isArray(rewritten.sections)) {
    rewritten.sections = rewriteAtUrisNamespace(rewritten.sections, namespace);
  }

  if (collection.endsWith('.site.section')) {
    if (rewritten.ref) rewritten.ref = rewriteAtUriNamespace(rewritten.ref, namespace);
    if (Array.isArray(rewritten.records)) rewritten.records = rewriteAtUrisNamespace(rewritten.records, namespace);
    if (rewritten.collection) rewritten.collection = mapCollectionToNamespace(rewritten.collection, namespace);
    if (rewritten.data && typeof rewritten.data === 'object') {
      rewritten.data = { ...rewritten.data };
      if (rewritten.data.ref) rewritten.data.ref = rewriteAtUriNamespace(rewritten.data.ref, namespace);
      if (Array.isArray(rewritten.data.records)) rewritten.data.records = rewriteAtUrisNamespace(rewritten.data.records, namespace);
      if (rewritten.data.collection) rewritten.data.collection = mapCollectionToNamespace(rewritten.data.collection, namespace);
    }
  }

  return rewritten;
}

export function buildSectionRecordForSave(section: any, sectionCollection: string): any {
  return {
    $type: sectionCollection,
    type: section.type,
    title: section.title || undefined,
    layout: section.layout || undefined,
    ref: section.ref || undefined,
    collection: section.collection || undefined,
    rkey: section.rkey || undefined,
    records: section.records || undefined,
    content: section.content || undefined,
    format: section.format || undefined,
    limit: section.limit || undefined,
    hideHeader: section.hideHeader || undefined,
  };
}
