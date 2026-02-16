/**
 * Field Extractor - intelligently extract common fields from any record
 *
 * This is the key abstraction that makes layouts work with any lexicon.
 * Instead of hardcoding lexicon support, we extract common fields by
 * looking for them under different names.
 *
 * HOW IT WORKS
 * ============
 * 1. **Schema Registry**: Known lexicons have precise field mappings for
 *    optimal extraction accuracy and confidence.
 * 2. **Heuristic Fallback**: Unknown lexicons use heuristic field matching
 *    based on common naming patterns.
 * 3. **Confidence Scoring**: Extraction confidence is calculated based on:
 *    - Lexicon schema availability (highest confidence)
 *    - Field match quality (high confidence if multiple fields match)
 *    - Field match quantity (medium confidence if 2+ fields match)
 *    - Unknown lexicon with few matches (low confidence)
 *
 * ADDING NEW LEXICON SCHEMAS
 * ===========================
 * To add support for a new lexicon, add an entry to LEXICON_SCHEMAS:
 *
 * ```typescript
 * 'your.lexicon.type': {
 *   // Direct field mappings (these take precedence over heuristics)
 *   title: 'exactFieldName',           // or ['field1', 'field2'] for multiple options
 *   content: 'contentField',
 *   image: 'imageField',
 *   date: 'createdAt',
 *   // ... other fields
 *   
 *   // Special extractors for complex fields
 *   images: (record) => record.value.embeds?.map(e => e.image), // Custom function
 *   
 *   // Metadata about the lexicon
 *   confidence: 'high' as const,  // Override default confidence
 *   preferredLayout: 'post',      // Suggested layout for this lexicon
 * }
 * ```
 *
 * Field mapping types:
 * - **string**: Exact field name (e.g., 'title' → record.value.title)
 * - **string[]**: Array of field names to try in order (e.g., ['title', 'name'])
 * - **function**: Custom extractor function `(record) => any`
 *
 * After adding a schema, add the lexicon type to KNOWN_LEXICONS for maximum confidence.
 */

/**
 * Lexicon Schema Registry
 *
 * Maps lexicon types to precise field mappings for optimal extraction.
 * When a lexicon has a schema, we use these mappings instead of heuristics.
 *
 * Schema format:
 * - Direct field: string with exact field name
 * - Multiple options: string[] with field names to try in order
 * - Custom extractor: function(record) => any
 * - Confidence override: 'high' | 'medium' | 'low'
 * - Preferred layout: string layout name
 */
type FieldMapping = string | string[] | ((record: any) => any);

interface LexiconSchema {
  title?: FieldMapping;
  pronouns?: FieldMapping;
  content?: FieldMapping;
  url?: FieldMapping;
  image?: FieldMapping;
  images?: FieldMapping;
  banner?: FieldMapping;
  date?: FieldMapping;
  author?: FieldMapping;
  tags?: FieldMapping;
  items?: FieldMapping;
  confidence?: 'high' | 'medium' | 'low';
  preferredLayout?: string;
}

const LEXICON_SCHEMAS: Record<string, LexiconSchema> = {
  // Bluesky Posts
  'app.bsky.feed.post': {
    title: 'displayName', // Usually empty, but fallback
    content: 'text',
    images: (record) => {
      const embed = record.value?.embed;  // singular, not embeds
      if (!embed) return undefined;

      const images: Array<{ url: string; alt?: string }> = [];

      // Helper to extract images from an embed
      const extractFromEmbed = (embedData: any) => {
        if (embedData?.$type === 'app.bsky.embed.images' && embedData.images) {
          for (const img of embedData.images) {
            let url: string | null = null;

            // View records have fullsize/thumb URLs
            if (img.fullsize) url = img.fullsize;
            else if (img.thumb) url = img.thumb;
            // Raw records have img.image as blob reference
            else if (img.image) {
              const cid = img.image.ref?.$link || img.image.ref || img.image.cid;
              const did = record.uri?.split('/')[2] || record.did;
              if (cid && did) {
                url = `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${cid}@jpeg`;
              }
            }

            if (url) images.push({ url, alt: img.alt || '' });
          }
        }
      };

      // Handle app.bsky.embed.images directly
      extractFromEmbed(embed);

      // Handle app.bsky.embed.recordWithMedia (quote post + images)
      if (embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media) {
        extractFromEmbed(embed.media);
      }

      return images.length > 0 ? images : undefined;
    },
    date: 'createdAt',
    confidence: 'high',
    preferredLayout: 'post'
  },

  // Bluesky Profiles
  'app.bsky.actor.profile': {
    title: 'displayName',
    content: 'description',
    image: 'avatar',
    url: 'website',
    date: 'createdAt',
    confidence: 'high',
    preferredLayout: 'profile'
  },

  // Bluesky Lists
  'app.bsky.graph.list': {
    title: 'name',
    content: 'description',
    date: 'createdAt',
    confidence: 'high',
    preferredLayout: 'list'
  },

  // WhiteWind Blog
  'com.whtwnd.blog.entry': {
    title: 'title',
    content: 'content',
    date: 'publishedAt',
    tags: 'tags',
    confidence: 'high',
    preferredLayout: 'post'
  },

  // Linkat Board
  'blue.linkat.board': {
    title: 'name',
    content: 'description',
    items: 'links',
    confidence: 'high',
    preferredLayout: 'links'
  },

  // Spores.garden Site Config
  'garden.spores.site.config': {
    title: 'title',
    items: 'sections',
    confidence: 'high'
  },

  // Spores.garden Content Block
  'garden.spores.content.text': {
    title: 'title',
    content: 'content',
    date: 'createdAt',
    confidence: 'high',
    preferredLayout: 'post'
  },

  // Spores.garden Profile
  'garden.spores.site.profile': {
    title: 'displayName',
    pronouns: 'pronouns',
    content: 'description',
    image: 'avatar',
    confidence: 'high',
    preferredLayout: 'profile'
  },

  // Spores.garden Image
  'garden.spores.content.image': {
    title: 'title',
    image: 'image',
    date: 'createdAt',
    preferredLayout: 'image'
  },

  // Spores.garden Flower (social interaction)
  'garden.spores.social.flower': {
    date: 'createdAt',
    // subject is a DID reference
    confidence: 'high'
  },

  // Spores.garden Taken Flower
  'garden.spores.social.takenFlower': {
    content: 'note', // Optional note when taking flower
    date: 'createdAt',
    confidence: 'high'
  },

  // Community Calendar Event (Smoke Signal)
  'community.lexicon.calendar.event': {
    title: 'name',
    content: 'description',
    date: 'startsAt',
    url: (record) => {
      // Always link to smokesignal.events page for the event
      if (record.uri) {
        const parts = record.uri.split('/');
        const did = parts[2];  // did:plc:xxxx
        const rkey = parts[4]; // event id
        if (did && rkey) {
          return `https://smokesignal.events/${did}/${rkey}`;
        }
      }
      return undefined;
    },
    confidence: 'high',
    preferredLayout: 'smoke-signal'
  },

  // Community Calendar RSVP (Smoke Signal - attending events)
  'community.lexicon.calendar.rsvp': {
    title: (record) => {
      // Generate title from status
      const status = record.value?.status || 'going';
      const statusLabel = status.includes('#') ? status.split('#').pop() : status;
      return `RSVP: ${statusLabel}`;
    },
    content: (record) => {
      // Try to describe what event this is for
      const subject = record.value?.subject;
      if (subject?.uri) {
        return `Event: ${subject.uri}`;
      }
      return undefined;
    },
    url: (record) => {
      // Link to smokesignal.events page from subject reference
      const subjectUri = record.value?.subject?.uri;
      if (subjectUri) {
        const parts = subjectUri.split('/');
        const did = parts[2];  // did:plc:xxxx
        const rkey = parts[4]; // event id
        if (did && rkey) {
          return `https://smokesignal.events/${did}/${rkey}`;
        }
      }
      return undefined;
    },
    date: 'createdAt',
    confidence: 'high',
    preferredLayout: 'smoke-signal'
  },

  // Leaflet.pub Document (long-form publishing)
  'pub.leaflet.document': {
    title: 'title',
    date: 'publishedAt',
    tags: 'tags',
    image: (record) => {
      // Cover image is a blob reference
      const coverImage = record.value?.coverImage;
      if (coverImage?.$type === 'blob' && coverImage.ref?.$link) {
        return coverImage; // Return blob reference for formatBlobUrl
      }
      return undefined;
    },
    // Store the raw record value for block rendering
    content: (record) => record.value, // We'll extract blocks from this
    url: (record) => {
      // Generate leaflet.pub URL from postRef or publication
      const postRef = record.value?.postRef;
      if (postRef?.uri) {
        const match = postRef.uri.match(/at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)$/);
        if (match) {
          return `https://leaflet.pub/@${match[1]}/${match[2]}`;
        }
      }
      return undefined;
    },
    confidence: 'high',
    preferredLayout: 'leaflet'
  },

  // Leaflet.pub Document (site standard)
  'site.standard.document': {
    title: 'title',
    date: 'publishedAt',
    tags: 'tags',
    image: (record) => {
      const coverImage = record.value?.coverImage;
      if (coverImage?.$type === 'blob' && coverImage.ref?.$link) {
        return coverImage;
      }
      return undefined;
    },
    content: (record) => record.value?.content || record.value,
    url: (record) => {
      const postRef = record.value?.postRef;
      if (postRef?.uri) {
        const match = postRef.uri.match(/at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)$/);
        if (match) {
          return `https://leaflet.pub/@${match[1]}/${match[2]}`;
        }
      }
      return undefined;
    },
    confidence: 'high',
    preferredLayout: 'leaflet'
  }
};

/**
 * Lexicons known to render well with the generic field extractor.
 * Other lexicons will still work but may have lower confidence scores.
 */
const KNOWN_LEXICONS = new Set([
  'app.bsky.feed.post',
  'app.bsky.actor.profile',
  'app.bsky.graph.list',
  'com.whtwnd.blog.entry',
  'blue.linkat.board',
  'garden.spores.site.config',
  'garden.spores.content.text',
  'garden.spores.content.image',
  'garden.spores.site.profile',
  'garden.spores.social.flower',
  'garden.spores.social.takenFlower',
  'pub.leaflet.document',
  'site.standard.document',
  'community.lexicon.calendar.event',
  'community.lexicon.calendar.rsvp'
]);

/**
 * Check if a lexicon is known to work well with the field extractor
 */
export function isKnownLexicon(type: string | undefined): boolean {
  if (!type) return false;
  return KNOWN_LEXICONS.has(type);
}

/**
 * Get the schema for a lexicon type, if available
 */
function getLexiconSchema(type: string | undefined): LexiconSchema | undefined {
  if (!type) return undefined;
  return LEXICON_SCHEMAS[type];
}

/**
 * Field mappings - arrays of possible field names for each semantic field
 */
const FIELD_MAPPINGS = {
  title: ['title', 'name', 'displayName', 'subject', 'heading'],
  pronouns: ['pronouns', 'pronoun'],
  content: ['content', 'text', 'description', 'message', 'body', 'summary', 'bio'],
  url: ['url', 'uri', 'link', 'href', 'website'],
  image: ['image', 'avatar', 'thumbnail', 'picture', 'photo'],
  images: ['images', 'photos', 'media', 'attachments', 'blobs'],
  banner: ['banner', 'coverImage', 'cover', 'header', 'headerImage'],
  date: ['createdAt', 'indexedAt', 'publishedAt', 'updatedAt', 'timestamp', 'date'],
  author: ['author', 'creator', 'by', 'from'],
  tags: ['tags', 'labels', 'categories', 'topics', 'keywords'],
  items: ['items', 'links', 'entries', 'records', 'children']
};

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    // Handle array access like "images[0]"
    const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, arrKey, index] = arrayMatch;
      return current[arrKey]?.[parseInt(index, 10)];
    }
    return current[key];
  }, obj);
}

/**
 * Extract a single field from a record using schema or heuristics
 */
function extractField(record, fieldType: string, lexiconType?: string): any {
  const value = record.value || record;

  // First, try schema-based extraction if available
  if (lexiconType) {
    const schema = getLexiconSchema(lexiconType);
    if (schema) {
      const schemaField = schema[fieldType as keyof LexiconSchema];
      if (schemaField) {
        // Custom extractor function
        if (typeof schemaField === 'function') {
          try {
            const result = schemaField(record);
            if (result !== undefined && result !== null && result !== '') {
              return result;
            }
          } catch (e) {
            // Fall through to heuristics if extractor fails
            console.warn(`Schema extractor failed for ${lexiconType}.${fieldType}:`, e);
          }
        }
        // Direct field name or array of field names
        else {
          const fieldNames = Array.isArray(schemaField) ? schemaField : [schemaField];
          for (const name of fieldNames) {
            const fieldValue = value[name] ?? getNestedValue(record, name);
            if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
              return fieldValue;
            }
          }
        }
      }
    }
  }

  // Fall back to heuristic extraction
  const possibleNames = FIELD_MAPPINGS[fieldType] || [fieldType];

  for (const name of possibleNames) {
    // Check direct property
    if (record[name] !== undefined && record[name] !== null && record[name] !== '') {
      return record[name];
    }

    // Check value property (for AT Protocol records)
    if (value[name] !== undefined && value[name] !== null && value[name] !== '') {
      return value[name];
    }

    // Check nested paths
    const nestedValue = getNestedValue(record, name);
    if (nestedValue !== undefined && nestedValue !== null && nestedValue !== '') {
      return nestedValue;
    }
  }

  return undefined;
}

/**
 * Extract all common fields from a record
 * Uses schema registry when available, falls back to heuristics
 */
export function extractFields(record) {
  const value = record.value || record;
  const lexiconType = value.$type;

  return {
    // Core content fields
    title: extractField(record, 'title', lexiconType),
    pronouns: extractField(record, 'pronouns', lexiconType),
    content: extractField(record, 'content', lexiconType),
    url: extractField(record, 'url', lexiconType),

    // Media
    image: extractImage(record, lexiconType),
    images: extractImages(record, lexiconType),
    banner: extractBanner(record, lexiconType),

    // Metadata
    date: extractDate(record, lexiconType),
    author: extractField(record, 'author', lexiconType),
    tags: extractTags(record, lexiconType),

    // Collections
    items: extractField(record, 'items', lexiconType),

    // Original record reference
    $type: lexiconType,
    uri: record.uri,
    cid: record.cid,

    // Raw value for custom rendering
    $raw: value
  };
}

/**
 * Extract image field, handling various formats
 * Uses schema registry when available
 */
function extractImage(record, lexiconType?: string) {
  const value = record.value || record;

  // Try schema-based extraction first
  const schemaImage = extractField(record, 'image', lexiconType);
  if (schemaImage) {
    // Handle schema result (could be string URL, blob ref, or custom format)
    if (typeof schemaImage === 'string') return schemaImage;
    if (schemaImage.url) return schemaImage.url;
    if (schemaImage.thumb) return schemaImage.thumb;
    if (schemaImage.$type === 'blob' || schemaImage.ref) {
      return formatBlobUrl(record, schemaImage);
    }
  }

  // Fall back to heuristic extraction
  for (const name of FIELD_MAPPINGS.image) {
    const img = value[name];
    if (!img) continue;

    // If it's a string URL, return directly
    if (typeof img === 'string') return img;

    // If it's a blob reference
    if (img.$type === 'blob' || img.ref) {
      return formatBlobUrl(record, img);
    }

    // If it has a url property
    if (img.url) return img.url;

    // If it has a thumb property (Bluesky style)
    if (img.thumb) return img.thumb;
  }

  // Check first image in images array
  const images = extractImages(record, lexiconType);
  if (images && images.length > 0) {
    const firstImage = images[0];
    // Handle { url, alt } objects from schema extractors
    if (typeof firstImage === 'object' && firstImage.url) {
      return firstImage.url;
    }
    return firstImage;
  }

  return undefined;
}

/**
 * Extract banner field, handling various formats
 * Uses schema registry when available
 */
function extractBanner(record, lexiconType?: string) {
  const value = record.value || record;

  // Try schema-based extraction first
  const schemaBanner = extractField(record, 'banner', lexiconType);
  if (schemaBanner) {
    // Handle schema result (could be string URL, blob ref, or custom format)
    if (typeof schemaBanner === 'string') return schemaBanner;
    if (schemaBanner.url) return schemaBanner.url;
    if (schemaBanner.$type === 'blob' || schemaBanner.ref) {
      return formatBlobUrl(record, schemaBanner);
    }
  }

  // Fall back to heuristic extraction
  for (const name of FIELD_MAPPINGS.banner) {
    const banner = value[name];
    if (!banner) continue;

    // If it's a string URL, return directly
    if (typeof banner === 'string') return banner;

    // If it's a blob reference
    if (banner.$type === 'blob' || banner.ref) {
      return formatBlobUrl(record, banner);
    }

    // If it has a url property
    if (banner.url) return banner.url;
  }

  return undefined;
}

/**
 * Extract images array, handling various formats
 * Uses schema registry when available
 * Returns array of strings (URLs) or objects with { url, alt } for accessibility
 */
function extractImages(record, lexiconType?: string): Array<string | { url: string; alt?: string }> {
  // Try schema-based extraction first
  const schemaImages = extractField(record, 'images', lexiconType);
  if (schemaImages) {
    if (Array.isArray(schemaImages) && schemaImages.length > 0) {
      return schemaImages.map(img => {
        if (typeof img === 'string') return img;
        // Preserve { url, alt } objects from schema extractors
        if (img.url && typeof img.url === 'string') {
          return { url: img.url, alt: img.alt || '' };
        }
        if (img.thumb) return img.thumb;
        if (img.fullsize) return img.fullsize;
        if (img.$type === 'blob' || img.ref) {
          return formatBlobUrl(record, img);
        }
        return null;
      }).filter(Boolean) as Array<string | { url: string; alt?: string }>;
    }
  }

  // Fall back to heuristic extraction
  const value = record.value || record;

  for (const name of FIELD_MAPPINGS.images) {
    const imgs = value[name];
    if (!Array.isArray(imgs) || imgs.length === 0) continue;

    return imgs.map(img => {
      if (typeof img === 'string') return img;
      if (img.url) return img.url;
      if (img.thumb) return img.thumb;
      if (img.fullsize) return img.fullsize;
      if (img.$type === 'blob' || img.ref) {
        return formatBlobUrl(record, img);
      }
      return null;
    }).filter(Boolean) as Array<string | { url: string; alt?: string }>;
  }

  return [];
}

/**
 * Format a blob URL from a blob reference
 */
function formatBlobUrl(record, blob) {
  // If it has a ref.$link (CID)
  const cid = blob.ref?.$link || blob.ref || blob.cid;
  if (!cid) return null;

  // Get the DID from the record
  const did = record.uri?.split('/')[2] || record.did;
  if (!did) return null;

  // Return CDN URL
  return `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${cid}@jpeg`;
}

/**
 * Extract and format date
 * Uses schema registry when available
 */
function extractDate(record, lexiconType?: string) {
  // Try schema-based extraction first
  const schemaDate = extractField(record, 'date', lexiconType);
  if (schemaDate) {
    const date = new Date(schemaDate);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Fall back to heuristic extraction
  const value = record.value || record;

  for (const name of FIELD_MAPPINGS.date) {
    const dateVal = value[name];
    if (!dateVal) continue;

    // Try to parse as date
    const date = new Date(dateVal);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return undefined;
}

/**
 * Extract tags/labels
 * Uses schema registry when available
 */
function extractTags(record, lexiconType?: string) {
  // Try schema-based extraction first
  const schemaTags = extractField(record, 'tags', lexiconType);
  if (schemaTags) {
    if (Array.isArray(schemaTags)) {
      return schemaTags.map(t => (typeof t === 'string' ? t : t.name || t.tag || t.val)).filter(Boolean);
    }
  }

  // Fall back to heuristic extraction
  const value = record.value || record;

  for (const name of FIELD_MAPPINGS.tags) {
    const tags = value[name];
    if (Array.isArray(tags)) {
      return tags.map(t => (typeof t === 'string' ? t : t.name || t.tag || t.val)).filter(Boolean);
    }
  }

  return [];
}

/**
 * Get a human-readable type name from a lexicon $type
 */
export function getTypeName(type) {
  if (!type) return 'Unknown';

  // Extract the last part of the lexicon name
  const parts = type.split('.');
  const last = parts[parts.length - 1];

  // Convert camelCase to Title Case
  return last
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Get the confidence score for field extraction from a record
 *
 * Useful for displaying extraction quality indicators in the UI.
 *
 * @param record - AT Protocol record
 * @returns Confidence level: 'high' | 'medium' | 'low'
 */
export function getExtractionConfidence(record: any): 'high' | 'medium' | 'low' {
  const fields = extractFields(record);
  return calculateConfidence(record, fields);
}

/**
 * Check if a lexicon has a schema registered
 *
 * @param lexiconType - Lexicon type (e.g., 'app.bsky.feed.post')
 * @returns true if a schema exists for this lexicon
 */
export function hasLexiconSchema(lexiconType: string | undefined): boolean {
  if (!lexiconType) return false;
  return !!LEXICON_SCHEMAS[lexiconType];
}

export interface LayoutSuggestion {
  layout: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Calculate confidence score for field extraction
 *
 * Confidence levels:
 * - high: Schema available (precise mappings) OR known lexicon with 3+ fields
 * - medium: Known lexicon with 2+ fields OR unknown lexicon with 3+ fields
 * - low: Unknown lexicon with < 3 fields or < 2 meaningful fields
 */
function calculateConfidence(record: any, fields: ReturnType<typeof extractFields>): 'high' | 'medium' | 'low' {
  const lexiconType = fields.$type;
  const schema = getLexiconSchema(lexiconType);

  // If schema exists with explicit confidence override, use it
  if (schema?.confidence) {
    return schema.confidence;
  }

  // If schema exists, confidence is high (precise mappings)
  if (schema) {
    return 'high';
  }

  const isKnown = isKnownLexicon(lexiconType);

  // Count meaningful fields extracted
  const meaningfulFields = [
    fields.title,
    fields.content,
    fields.image,
    fields.images?.length > 0 ? fields.images : null,
    fields.url,
    fields.date,
    fields.author,
    fields.tags?.length > 0 ? fields.tags : null
  ].filter(Boolean).length;

  // High confidence: Known lexicon with 3+ meaningful fields
  if (isKnown && meaningfulFields >= 3) {
    return 'high';
  }

  // Medium confidence: Known lexicon with 2+ fields OR unknown with 3+ fields
  if ((isKnown && meaningfulFields >= 2) || meaningfulFields >= 3) {
    return 'medium';
  }

  // Low confidence: Everything else
  return 'low';
}

/**
 * Determine the best layout for a record based on its fields.
 * Returns both a layout suggestion and a confidence score.
 *
 * Confidence levels:
 * - high: Schema available (precise field mappings) or known lexicon with 3+ fields
 * - medium: Known lexicon with 2+ fields or unknown lexicon with 3+ fields
 * - low: Unknown lexicon with < 3 fields or < 2 meaningful fields
 */
export function suggestLayout(record): LayoutSuggestion {
  const fields = extractFields(record);
  const lexiconType = fields.$type;
  const schema = getLexiconSchema(lexiconType);

  // Calculate confidence based on schema availability and field extraction success
  let confidence = calculateConfidence(record, fields);

  // Check if schema specifies a preferred layout
  if (schema?.preferredLayout) {
    return { layout: schema.preferredLayout, confidence };
  }

  // Has images prominently → image layout
  if (fields.images?.length > 0 || fields.image) {
    if (!fields.content || fields.content.length < 100) {
      return { layout: 'image', confidence };
    }
  }

  // Has URL but limited content → link layout
  if (fields.url && (!fields.content || fields.content.length < 200)) {
    return { layout: 'link', confidence };
  }

  // Has items array → list or links layout
  if (fields.items?.length > 0) {
    // Check if items are link-like
    const firstItem = fields.items[0] as Record<string, unknown>;
    if (firstItem && (firstItem.url || firstItem.href)) {
      return { layout: 'links', confidence };
    }
    return { layout: 'list', confidence };
  }

  // Long content → post layout
  if (fields.content && fields.content.length > 500) {
    return { layout: 'post', confidence };
  }

  // Short content → card layout
  return { layout: 'card', confidence };
}
