# Layout System Developer Guide

The spores.garden layout system allows you to create custom renderers for displaying AT Protocol records. This guide explains how to create, register, and use layouts.

## Overview

The layout system is built on three key concepts:

1. **Field Extraction**: The `extractFields()` function intelligently extracts common fields (title, content, image, date, etc.) from any AT Protocol record, regardless of lexicon type.
2. **Layout Functions**: Layout functions take extracted fields and return HTML elements for rendering.
3. **Registration**: Layouts are registered with a unique name and can be referenced in section configurations.

## Architecture

```
AT Protocol Record
    ↓
extractFields() → Extracted Fields Object
    ↓
Layout Function → HTMLElement
    ↓
Rendered on Page
```

### Field Extractor

The field extractor (`src/records/field-extractor.ts`) provides a unified interface for extracting common fields from records. It works in two modes:

1. **Schema-based extraction**: For known lexicons, uses precise field mappings for optimal accuracy.
2. **Heuristic extraction**: For unknown lexicons, intelligently guesses field names based on common patterns.

The extractor returns an object with standardized field names:
- `title` - Record title/name
- `content` - Main text content
- `image` - Primary image URL
- `images` - Array of image URLs (for galleries)
- `url` - Link URL
- `date` - Date object
- `author` - Author information
- `tags` - Array of tags
- `items` - Array of items (for lists/collections)
- `$type` - Original lexicon type
- `$raw` - Access to raw record value

## Creating a New Layout

### Step 1: Create the Layout File

Create a new TypeScript file in `src/layouts/` (e.g., `src/layouts/my-layout.ts`):

```typescript
import { extractFields } from '../records/field-extractor';

/**
 * My Custom Layout
 * 
 * Brief description of what this layout does.
 * 
 * @param fields - Extracted fields from the record
 * @param record - Optional original record reference
 */
export function renderMyLayout(
  fields: ReturnType<typeof extractFields>, 
  record?: any
): HTMLElement {
  // Create the root element
  const html = document.createElement('article');
  html.className = 'layout-my-layout';
  
  // Access extracted fields
  const title = fields.title || 'Untitled';
  const content = fields.content || '';
  const image = fields.image;
  const date = fields.date;
  
  // Build the HTML structure
  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.alt = title;
    img.loading = 'lazy';
    html.appendChild(img);
  }
  
  if (title) {
    const titleEl = document.createElement('h2');
    titleEl.textContent = title;
    html.appendChild(titleEl);
  }
  
  if (content) {
    const contentEl = document.createElement('div');
    contentEl.textContent = content;
    html.appendChild(contentEl);
  }
  
  if (date) {
    const dateEl = document.createElement('time');
    dateEl.dateTime = date.toISOString();
    dateEl.textContent = date.toLocaleDateString();
    html.appendChild(dateEl);
  }
  
  // Return the element
  return html;
}
```

### Step 2: Register the Layout

Add your layout to `src/layouts/index.ts`:

```typescript
import { renderMyLayout } from './my-layout';

// Register the layout
registerLayout('my-layout', renderMyLayout);
```

### Step 3: Use the Layout

Users can now select your layout when creating sections in the UI, or it can be referenced in code:

```typescript
import { renderRecord } from '../layouts/index';

const element = await renderRecord(record, 'my-layout');
```

## Layout Function Signature

All layout functions must follow this signature:

```typescript
function renderLayoutName(
  fields: ReturnType<typeof extractFields>,
  record?: any
): HTMLElement
```

**Parameters:**
- `fields` - Object containing extracted/common fields from the record
- `record` - Optional original AT Protocol record (useful for accessing raw data)

**Returns:**
- `HTMLElement` - The DOM element to render

**Note:** Layout functions can be synchronous or asynchronous. If returning a `Promise<HTMLElement>`, the layout system will await it.

## Field Extractor Usage

### Basic Usage

The field extractor automatically extracts common fields:

```typescript
import { extractFields } from '../records/field-extractor';

export function renderMyLayout(fields: ReturnType<typeof extractFields>): HTMLElement {
  // Standard fields are available
  const title = fields.title;
  const content = fields.content;
  const image = fields.image;
  const date = fields.date;
  
  // ... use fields to build HTML
}
```

### Accessing Raw Record Data

For advanced use cases, you may need access to the original record:

```typescript
export function renderMyLayout(
  fields: ReturnType<typeof extractFields>,
  record?: any
): HTMLElement {
  // Use extracted fields for common data
  const title = fields.title;
  
  // Access raw record for lexicon-specific fields
  const customField = record?.value?.myCustomField;
  const rawData = fields.$raw; // Also available in fields.$raw
  
  // ... build HTML
}
```

### Adding Lexicon Schemas

For better field extraction accuracy, you can add schema mappings for specific lexicons. Edit `src/records/field-extractor.ts`:

```typescript
const LEXICON_SCHEMAS: Record<string, LexiconSchema> = {
  // ... existing schemas ...
  
  'your.lexicon.type': {
    // Direct field name
    title: 'exactFieldName',
    
    // Multiple field names to try (in order)
    content: ['content', 'body', 'text'],
    
    // Custom extractor function
    image: (record) => record.value.embeds?.[0]?.image?.url,
    
    // Array of images
    images: (record) => record.value.media?.map(m => m.url),
    
    // Metadata
    confidence: 'high' as const,
    preferredLayout: 'my-layout'
  }
};
```

**Field Mapping Types:**
- `string` - Exact field name (e.g., `'title'`)
- `string[]` - Array of field names to try in order (e.g., `['title', 'name']`)
- `function` - Custom extractor function: `(record) => any`

See `src/records/field-extractor.ts` for complete documentation and examples.

## Examples

### Simple Card Layout

```typescript
import { extractFields } from '../records/field-extractor';

export function renderCard(fields: ReturnType<typeof extractFields>): HTMLElement {
  const card = document.createElement('article');
  card.className = 'layout-card';
  
  if (fields.image) {
    const img = document.createElement('img');
    img.src = fields.image;
    img.alt = fields.title || '';
    img.loading = 'lazy';
    card.appendChild(img);
  }
  
  if (fields.title) {
    const title = document.createElement('h3');
    title.textContent = fields.title;
    card.appendChild(title);
  }
  
  if (fields.content) {
    const content = document.createElement('p');
    content.textContent = fields.content.slice(0, 200); // Truncate
    card.appendChild(content);
  }
  
  return card;
}
```

### Image Gallery Layout

```typescript
import { extractFields } from '../records/field-extractor';

export function renderGallery(fields: ReturnType<typeof extractFields>): HTMLElement {
  const gallery = document.createElement('div');
  gallery.className = 'layout-gallery';
  
  const images = fields.images || (fields.image ? [fields.image] : []);
  
  images.forEach((src, index) => {
    const imgContainer = document.createElement('div');
    imgContainer.className = 'gallery-item';
    
    const img = document.createElement('img');
    img.src = src;
    img.alt = fields.title ? `${fields.title} - Image ${index + 1}` : `Image ${index + 1}`;
    img.loading = 'lazy';
    
    imgContainer.appendChild(img);
    gallery.appendChild(imgContainer);
  });
  
  return gallery;
}
```

### Async Layout with Data Fetching

```typescript
import { extractFields } from '../records/field-extractor';
import { getProfile } from '../at-client';

export async function renderProfile(fields: ReturnType<typeof extractFields>): Promise<HTMLElement> {
  const profile = document.createElement('div');
  profile.className = 'layout-profile';
  
  // Fetch additional data asynchronously
  let avatar = fields.image;
  if (fields.author?.did) {
    try {
      const authorProfile = await getProfile(fields.author.did);
      avatar = authorProfile.avatar || avatar;
    } catch (error) {
      console.warn('Failed to fetch profile:', error);
    }
  }
  
  if (avatar) {
    const img = document.createElement('img');
    img.src = avatar;
    img.className = 'profile-avatar';
    profile.appendChild(img);
  }
  
  if (fields.title) {
    const name = document.createElement('h2');
    name.textContent = fields.title;
    profile.appendChild(name);
  }
  
  return profile;
}
```

## Best Practices

### Accessibility

Always include proper ARIA attributes and semantic HTML:

```typescript
const article = document.createElement('article');
article.setAttribute('aria-label', fields.title || 'Content');
article.className = 'layout-my-layout';

// Use semantic elements
const title = document.createElement('h2'); // Not div
const time = document.createElement('time');
time.dateTime = date.toISOString();
```

### Error Handling

Handle missing or invalid data gracefully:

```typescript
if (fields.image) {
  const img = document.createElement('img');
  img.src = fields.image;
  img.alt = fields.title || 'Image';
  
  // Handle image load errors
  img.addEventListener('error', () => {
    img.style.display = 'none';
    const errorMsg = document.createElement('p');
    errorMsg.textContent = 'Failed to load image';
    errorMsg.setAttribute('role', 'alert');
    article.appendChild(errorMsg);
  });
  
  article.appendChild(img);
}
```

### Performance

- Use `loading="lazy"` for images
- Keep layouts lightweight and fast
- Avoid heavy computation in render functions
- Consider async rendering for data fetching

### Styling

- Use consistent class naming: `layout-{layout-name}`
- Follow existing CSS patterns in `src/themes/base.css`
- Keep styles scoped to avoid conflicts

## Available Built-in Layouts

The following layouts are available by default:

- `card` - Compact card display for short content
- `post` - Full article display for long-form content
- `image` - Visual-first display for images (supports galleries with modal)
- `link` - Single link with preview
- `links` - Link tree style list
- `list` - Generic list of items
- `profile` - Profile/about section display
- `raw` - Custom HTML content (sanitized)
- `flower-bed` - Displays planted flowers
- `collected-flowers` - Displays collected flowers
- `smoke-signal` - Displays Smoke Signal events
- `leaflet` - Displays Leaflet.pub articles

## Testing Your Layout

1. Create the layout file and register it
2. Add a test section in the UI with your layout
3. Load a record that matches your target lexicon
4. Verify the layout renders correctly
5. Test with various record types to ensure robustness

## Troubleshooting

### Fields Not Extracted

If expected fields are missing:
1. Check the record structure in the browser console
2. Add a lexicon schema to `field-extractor.ts` if needed
3. Access raw data via `fields.$raw` or `record.value`

### Layout Not Appearing

1. Ensure the layout is registered in `src/layouts/index.ts`
2. Check for TypeScript compilation errors
3. Verify the layout name matches exactly (case-sensitive)
4. Clear browser cache and reload

### Styling Issues

1. Check that your CSS classes are scoped properly
2. Review `src/themes/base.css` for existing patterns
3. Ensure no conflicting class names

## Further Reading

- `src/layouts/index.ts` - Layout registration and examples
- `src/records/field-extractor.ts` - Field extraction implementation
- `src/components/section-block.ts` - How layouts are used in sections
- `src/themes/base.css` - Available CSS classes and patterns
