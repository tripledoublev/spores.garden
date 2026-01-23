import { describe, it, expect } from 'vitest';
import { renderLeaflet } from './leaflet';
import { extractFields } from '../records/field-extractor';

describe('Leaflet Layout', () => {
  describe('Basic Rendering', () => {
    it('should render article with title', () => {
      const fields = {
        title: 'Test Article',
        date: new Date('2024-12-20T10:00:00Z')
      };

      const record = {
        value: {
          $type: 'pub.leaflet.document',
          title: 'Test Article',
          publishedAt: '2024-12-20T10:00:00Z',
          pages: []
        }
      };

      const result = renderLeaflet(fields as any, record);

      expect(result).toBeInstanceOf(HTMLElement);
      expect(result.className).toBe('layout-leaflet');
      expect(result.tagName).toBe('ARTICLE');

      const title = result.querySelector('.leaflet-title');
      expect(title).toBeTruthy();
      expect(title?.textContent).toBe('Test Article');
    });

    it('should render untitled article when title is missing', () => {
      const fields = {};
      const record = {
        value: {
          $type: 'pub.leaflet.document',
          pages: []
        }
      };

      const result = renderLeaflet(fields as any, record);
      const title = result.querySelector('.leaflet-title');

      expect(title).toBeTruthy();
      expect(title?.textContent).toBe('Untitled Article');
    });

    it('should display leaflet.pub badge', () => {
      const fields = {
        title: 'Test Article'
      };
      const record = {
        value: {
          $type: 'pub.leaflet.document',
          pages: []
        }
      };

      const result = renderLeaflet(fields as any, record);
      const badge = result.querySelector('.leaflet-badge');

      expect(badge).toBeTruthy();
      expect(badge?.textContent).toBe('leaflet.pub');
    });
  });

  describe('Text Block Rendering', () => {
    it('should render text blocks', () => {
      const fields = {
        title: 'Test Article'
      };
      const record = {
        value: {
          $type: 'pub.leaflet.document',
          pages: [{
            $type: 'pub.leaflet.pages.linearDocument',
            blocks: [{
              block: {
                $type: 'pub.leaflet.blocks.text',
                plaintext: 'This is a text block.'
              }
            }]
          }]
        }
      };

      const result = renderLeaflet(fields as any, record);
      const content = result.querySelector('.leaflet-content');
      const paragraphs = content?.querySelectorAll('p');

      expect(content).toBeTruthy();
      expect(paragraphs?.length).toBeGreaterThan(0);
      expect(paragraphs?.[0]?.textContent).toBe('This is a text block.');
    });

    it('should apply facets to text blocks', () => {
      const fields = {
        title: 'Test Article'
      };
      const record = {
        value: {
          $type: 'pub.leaflet.document',
          pages: [{
            $type: 'pub.leaflet.pages.linearDocument',
            blocks: [{
              block: {
                $type: 'pub.leaflet.blocks.text',
                plaintext: 'This is bold text.',
                facets: [{
                  index: {
                    byteStart: 8,
                    byteEnd: 12
                  },
                  features: [{
                    $type: 'pub.leaflet.richtext.facet#bold'
                  }]
                }]
              }
            }]
          }]
        }
      };

      const result = renderLeaflet(fields as any, record);
      const content = result.querySelector('.leaflet-content');
      const strong = content?.querySelector('strong');

      expect(strong).toBeTruthy();
      expect(strong?.textContent).toBe('bold');
    });
  });

  describe('Header Block Rendering', () => {
    it('should render header blocks', () => {
      const fields = {
        title: 'Test Article'
      };
      const record = {
        value: {
          $type: 'pub.leaflet.document',
          pages: [{
            $type: 'pub.leaflet.pages.linearDocument',
            blocks: [{
              block: {
                $type: 'pub.leaflet.blocks.header',
                level: 2,
                plaintext: 'Section Header'
              }
            }]
          }]
        }
      };

      const result = renderLeaflet(fields as any, record);
      const content = result.querySelector('.leaflet-content');
      const header = content?.querySelector('h2');

      expect(header).toBeTruthy();
      expect(header?.textContent).toBe('Section Header');
    });

    it('should respect header level', () => {
      const fields = {
        title: 'Test Article'
      };
      const record = {
        value: {
          $type: 'pub.leaflet.document',
          pages: [{
            $type: 'pub.leaflet.pages.linearDocument',
            blocks: [{
              block: {
                $type: 'pub.leaflet.blocks.header',
                level: 3,
                plaintext: 'Subsection'
              }
            }]
          }]
        }
      };

      const result = renderLeaflet(fields as any, record);
      const content = result.querySelector('.leaflet-content');
      const header = content?.querySelector('h3');

      expect(header).toBeTruthy();
      expect(header?.textContent).toBe('Subsection');
    });

    it('should clamp header level to valid range', () => {
      const fields = {
        title: 'Test Article'
      };
      const record = {
        value: {
          $type: 'pub.leaflet.document',
          pages: [{
            $type: 'pub.leaflet.pages.linearDocument',
            blocks: [{
              block: {
                $type: 'pub.leaflet.blocks.header',
                level: 10, // Should be clamped to h6
                plaintext: 'Deep Header'
              }
            }]
          }]
        }
      };

      const result = renderLeaflet(fields as any, record);
      const content = result.querySelector('.leaflet-content');
      const header = content?.querySelector('h6');

      expect(header).toBeTruthy();
    });
  });

  describe('Image Block Rendering', () => {
    it('should render image blocks', () => {
      const fields = {
        title: 'Test Article'
      };
      const record = {
        uri: 'at://did:plc:test/app.bsky.feed.post/rkey123',
        value: {
          $type: 'pub.leaflet.document',
          pages: [{
            $type: 'pub.leaflet.pages.linearDocument',
            blocks: [{
              block: {
                $type: 'pub.leaflet.blocks.image',
                image: {
                  ref: {
                    $link: 'cid123'
                  }
                }
              }
            }]
          }]
        }
      };

      const result = renderLeaflet(fields as any, record);
      const content = result.querySelector('.leaflet-content');
      const figure = content?.querySelector('.leaflet-block-image');
      const img = figure?.querySelector('img');

      expect(figure).toBeTruthy();
      expect(img).toBeTruthy();
      expect(img?.getAttribute('loading')).toBe('lazy');
    });

    it('should format blob URLs correctly', () => {
      const fields = {
        title: 'Test Article'
      };
      const record = {
        uri: 'at://did:plc:test123/app.bsky.feed.post/rkey',
        value: {
          $type: 'pub.leaflet.document',
          pages: [{
            $type: 'pub.leaflet.pages.linearDocument',
            blocks: [{
              block: {
                $type: 'pub.leaflet.blocks.image',
                image: {
                  ref: {
                    $link: 'cid456'
                  }
                }
              }
            }]
          }]
        }
      };

      const result = renderLeaflet(fields as any, record);
      const img = result.querySelector('.leaflet-block-image img');

      expect(img).toBeTruthy();
      expect(img?.getAttribute('src')).toContain('did:plc:test123');
      expect(img?.getAttribute('src')).toContain('cid456');
    });

    it('should handle aspect ratio when available', () => {
      const fields = {
        title: 'Test Article'
      };
      const record = {
        uri: 'at://did:plc:test/app.bsky.feed.post/rkey',
        value: {
          $type: 'pub.leaflet.document',
          pages: [{
            $type: 'pub.leaflet.pages.linearDocument',
            blocks: [{
              block: {
                $type: 'pub.leaflet.blocks.image',
                image: {
                  ref: {
                    $link: 'cid123'
                  }
                },
                aspectRatio: {
                  width: 16,
                  height: 9
                }
              }
            }]
          }]
        }
      };

      const result = renderLeaflet(fields as any, record);
      const img = result.querySelector('.leaflet-block-image img');

      expect(img).toBeTruthy();
      // CSS may normalize aspect ratio with spaces
      expect((img as HTMLElement)?.style.aspectRatio).toMatch(/16\s*\/\s*9/);
    });
  });

  describe('List Block Rendering', () => {
    it('should render unordered lists', () => {
      const fields = {
        title: 'Test Article'
      };
      const record = {
        value: {
          $type: 'pub.leaflet.document',
          pages: [{
            $type: 'pub.leaflet.pages.linearDocument',
            blocks: [{
              block: {
                $type: 'pub.leaflet.blocks.unorderedList',
                children: [{
                  $type: 'pub.leaflet.blocks.unorderedList#listItem',
                  content: {
                    $type: 'pub.leaflet.blocks.text',
                    plaintext: 'First item'
                  }
                }, {
                  $type: 'pub.leaflet.blocks.unorderedList#listItem',
                  content: {
                    $type: 'pub.leaflet.blocks.text',
                    plaintext: 'Second item'
                  }
                }]
              }
            }]
          }]
        }
      };

      const result = renderLeaflet(fields as any, record);
      const content = result.querySelector('.leaflet-content');
      const ul = content?.querySelector('.leaflet-block-list');
      const items = ul?.querySelectorAll('li');

      expect(ul).toBeTruthy();
      expect(items?.length).toBe(2);
      expect(items?.[0]?.textContent).toBe('First item');
      expect(items?.[1]?.textContent).toBe('Second item');
    });

    it('should render nested lists', () => {
      const fields = {
        title: 'Test Article'
      };
      const record = {
        value: {
          $type: 'pub.leaflet.document',
          pages: [{
            $type: 'pub.leaflet.pages.linearDocument',
            blocks: [{
              block: {
                $type: 'pub.leaflet.blocks.unorderedList',
                children: [{
                  $type: 'pub.leaflet.blocks.unorderedList#listItem',
                  content: {
                    $type: 'pub.leaflet.blocks.text',
                    plaintext: 'Parent item'
                  },
                  children: [{
                    $type: 'pub.leaflet.blocks.unorderedList#listItem',
                    content: {
                      $type: 'pub.leaflet.blocks.text',
                      plaintext: 'Child item'
                    }
                  }]
                }]
              }
            }]
          }]
        }
      };

      const result = renderLeaflet(fields as any, record);
      const content = result.querySelector('.leaflet-content');
      const nestedUl = content?.querySelector('ul ul');

      expect(nestedUl).toBeTruthy();
      expect(nestedUl?.querySelector('li')?.textContent).toBe('Child item');
    });
  });

  describe('Horizontal Rule Rendering', () => {
    it('should render horizontal rules', () => {
      const fields = {
        title: 'Test Article'
      };
      const record = {
        value: {
          $type: 'pub.leaflet.document',
          pages: [{
            $type: 'pub.leaflet.pages.linearDocument',
            blocks: [{
              block: {
                $type: 'pub.leaflet.blocks.horizontalRule'
              }
            }]
          }]
        }
      };

      const result = renderLeaflet(fields as any, record);
      const content = result.querySelector('.leaflet-content');
      const hr = content?.querySelector('hr');

      expect(hr).toBeTruthy();
    });
  });

  describe('Date and Metadata Rendering', () => {
    it('should render publication date', () => {
      const date = new Date('2024-12-20T10:00:00Z');
      const fields = {
        title: 'Test Article',
        date: date
      };
      const record = {
        value: {
          $type: 'pub.leaflet.document',
          publishedAt: '2024-12-20T10:00:00Z',
          pages: []
        }
      };

      const result = renderLeaflet(fields as any, record);
      const dateEl = result.querySelector('.leaflet-date');

      expect(dateEl).toBeTruthy();
      expect(dateEl?.tagName).toBe('TIME');
      expect(dateEl?.getAttribute('datetime')).toBe(date.toISOString());
    });

    it('should render tags', () => {
      const fields = {
        title: 'Test Article',
        tags: ['technology', 'web', 'atproto']
      };
      const record = {
        value: {
          $type: 'pub.leaflet.document',
          tags: ['technology', 'web', 'atproto'],
          pages: []
        }
      };

      const result = renderLeaflet(fields as any, record);
      const tagsEl = result.querySelector('.leaflet-tags');
      const tagSpans = tagsEl?.querySelectorAll('.leaflet-tag');

      expect(tagsEl).toBeTruthy();
      expect(tagSpans?.length).toBe(3);
      expect(tagSpans?.[0]?.textContent).toBe('technology');
    });
  });

  describe('Cover Image Rendering', () => {
    it('should render cover image when available', () => {
      const fields = {
        title: 'Test Article',
        image: {
          $type: 'blob',
          ref: {
            $link: 'cid123'
          }
        }
      };
      const record = {
        uri: 'at://did:plc:test/app.bsky.feed.post/rkey',
        value: {
          $type: 'pub.leaflet.document',
          coverImage: {
            $type: 'blob',
            ref: {
              $link: 'cid123'
            }
          },
          pages: []
        }
      };

      const result = renderLeaflet(fields as any, record);
      const imgContainer = result.querySelector('.leaflet-image');
      const img = imgContainer?.querySelector('img');

      expect(imgContainer).toBeTruthy();
      expect(img).toBeTruthy();
      expect(img?.getAttribute('alt')).toBe('Test Article');
      expect(img?.getAttribute('loading')).toBe('lazy');
    });

    it('should handle string image URL', () => {
      const fields = {
        title: 'Test Article',
        image: 'https://example.com/cover.jpg'
      };
      const record = {
        value: {
          $type: 'pub.leaflet.document',
          pages: []
        }
      };

      const result = renderLeaflet(fields as any, record);
      const img = result.querySelector('.leaflet-image img');

      expect(img).toBeTruthy();
      expect(img?.getAttribute('src')).toBe('https://example.com/cover.jpg');
    });
  });

  describe('URL Handling', () => {
    it('should make title a link when URL is available', () => {
      const fields = {
        title: 'Test Article',
        url: 'https://leaflet.pub/@user/article123'
      };
      const record = {
        value: {
          $type: 'pub.leaflet.document',
          pages: []
        }
      };

      const result = renderLeaflet(fields as any, record);
      const titleLink = result.querySelector('.leaflet-title a');

      expect(titleLink).toBeTruthy();
      expect(titleLink?.getAttribute('href')).toBe('https://leaflet.pub/@user/article123');
      expect(titleLink?.getAttribute('target')).toBe('_blank');
      expect(titleLink?.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('should render link back to leaflet.pub', () => {
      const fields = {
        title: 'Test Article',
        url: 'https://leaflet.pub/@user/article123'
      };
      const record = {
        value: {
          $type: 'pub.leaflet.document',
          pages: []
        }
      };

      const result = renderLeaflet(fields as any, record);
      const linkBack = result.querySelector('.leaflet-link-back a');

      expect(linkBack).toBeTruthy();
      expect(linkBack?.getAttribute('href')).toBe('https://leaflet.pub/@user/article123');
      expect(linkBack?.textContent).toBe('Read on leaflet.pub →');
    });
  });

  describe('Unknown Block Types', () => {
    it('should handle unknown block types gracefully', () => {
      const fields = {
        title: 'Test Article'
      };
      const record = {
        value: {
          $type: 'pub.leaflet.document',
          pages: [{
            $type: 'pub.leaflet.pages.linearDocument',
            blocks: [{
              block: {
                $type: 'pub.leaflet.blocks.unknown',
                plaintext: 'Unknown block content'
              }
            }]
          }]
        }
      };

      const result = renderLeaflet(fields as any, record);
      const content = result.querySelector('.leaflet-content');
      const unknownBlock = content?.querySelector('.leaflet-unknown-block');

      expect(unknownBlock).toBeTruthy();
      expect(unknownBlock?.textContent).toBe('Unknown block content');
    });
  });

  describe('Integration with Field Extractor', () => {
    it('should work with extracted fields from leaflet document', () => {
      const record = {
        uri: 'at://did:plc:test/app.bsky.feed.post/rkey123',
        value: {
          $type: 'pub.leaflet.document',
          title: 'Test Article',
          publishedAt: '2024-12-20T10:00:00Z',
          tags: ['test'],
          pages: [{
            $type: 'pub.leaflet.pages.linearDocument',
            blocks: [{
              block: {
                $type: 'pub.leaflet.blocks.text',
                plaintext: 'Article content'
              }
            }]
          }]
        }
      };

      const fields = extractFields(record);
      const result = renderLeaflet(fields as any, record);

      expect(result).toBeTruthy();
      const title = result.querySelector('.leaflet-title');
      expect(title?.textContent).toBe('Test Article');

      const content = result.querySelector('.leaflet-content');
      expect(content).toBeTruthy();
    });
  });
});
