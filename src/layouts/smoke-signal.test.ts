import { describe, it, expect } from 'vitest';
import { renderSmokeSignal } from './smoke-signal';
import { extractFields } from '../records/field-extractor';

describe('Smoke Signal Layout', () => {
  describe('Basic Rendering', () => {
    it('should render event with title', () => {
      const fields = {
        title: 'Test Event',
        content: 'Event description',
        date: new Date('2024-12-20T10:00:00Z')
      };

      const result = renderSmokeSignal(fields as any);

      expect(result).toBeInstanceOf(HTMLElement);
      expect(result.className).toBe('layout-smoke-signal');
      expect(result.getAttribute('aria-label')).toBe('Event');

      const title = result.querySelector('.event-title');
      expect(title).toBeTruthy();
      expect(title?.textContent).toBe('Test Event');
    });

    it('should render untitled event when title is missing', () => {
      const fields = {
        content: 'Event description'
      };

      const result = renderSmokeSignal(fields as any);
      const title = result.querySelector('.event-title');

      expect(title).toBeTruthy();
      expect(title?.textContent).toBe('Untitled Event');
    });
  });

  describe('Event Type Detection', () => {
    it('should detect hosting event from isHosting field', () => {
      const fields = {
        title: 'My Event',
        $raw: {
          isHosting: true
        }
      };

      const result = renderSmokeSignal(fields as any);
      const badge = result.querySelector('.event-type-badge');
      const container = result.querySelector('.smoke-signal-event');

      expect(badge?.textContent).toBe('Organizing');
      expect(container?.classList.contains('event-hosting')).toBe(true);
    });

    it('should detect attending event when not hosting', () => {
      const fields = {
        title: 'My Event',
        $raw: {
          isHosting: false
        }
      };

      const result = renderSmokeSignal(fields as any);
      const badge = result.querySelector('.event-type-badge');
      const container = result.querySelector('.smoke-signal-event');

      expect(badge?.textContent).toBe('RSVP');
      expect(container?.classList.contains('event-attending')).toBe(true);
    });

    it('should detect hosting from hosting field', () => {
      const fields = {
        title: 'My Event',
        $raw: {
          hosting: true
        }
      };

      const result = renderSmokeSignal(fields as any);
      const badge = result.querySelector('.event-type-badge');

      expect(badge?.textContent).toBe('Organizing');
    });

    it('should detect hosting from role field', () => {
      const fields = {
        title: 'My Event',
        $raw: {
          role: 'host'
        }
      };

      const result = renderSmokeSignal(fields as any);
      const badge = result.querySelector('.event-type-badge');

      expect(badge?.textContent).toBe('Organizing');
    });

    it('should detect hosting from eventType field', () => {
      const fields = {
        title: 'My Event',
        $raw: {
          eventType: 'hosting'
        }
      };

      const result = renderSmokeSignal(fields as any);
      const badge = result.querySelector('.event-type-badge');

      expect(badge?.textContent).toBe('Organizing');
    });

    it('should detect hosting from $type containing "host"', () => {
      const fields = {
        title: 'My Event',
        $type: 'com.example.event.hosting'
      };

      const result = renderSmokeSignal(fields as any);
      const badge = result.querySelector('.event-type-badge');

      expect(badge?.textContent).toBe('Organizing');
    });

    it('should default to organizing when no specific indicators', () => {
      const fields = {
        title: 'My Event'
      };

      const result = renderSmokeSignal(fields as any);
      const badge = result.querySelector('.event-type-badge');

      expect(badge?.textContent).toBe('Organizing');
    });
  });

  describe('Date Rendering', () => {
    it('should render date with proper formatting', () => {
      const date = new Date('2024-12-20T14:30:00Z');
      const fields = {
        title: 'Test Event',
        date: date
      };

      const result = renderSmokeSignal(fields as any);
      const dateEl = result.querySelector('.event-date');

      expect(dateEl).toBeTruthy();
      expect(dateEl?.tagName).toBe('TIME');
      expect(dateEl?.getAttribute('datetime')).toBe(date.toISOString());
      expect(dateEl?.textContent).toBeTruthy();
    });

    it('should handle date string', () => {
      const dateStr = '2024-12-20T10:00:00Z';
      const fields = {
        title: 'Test Event',
        date: dateStr
      };

      const result = renderSmokeSignal(fields as any);
      const dateEl = result.querySelector('.event-date');

      expect(dateEl).toBeTruthy();
      const dateObj = new Date(dateStr);
      expect(dateEl?.getAttribute('datetime')).toBe(dateObj.toISOString());
    });

    it('should handle invalid date gracefully', () => {
      const fields = {
        title: 'Test Event',
        date: 'invalid-date'
      };

      const result = renderSmokeSignal(fields as any);
      const dateEl = result.querySelector('.event-date');

      expect(dateEl).toBeTruthy();
      expect(dateEl?.getAttribute('datetime')).toBe('invalid-date');
    });

    it('should show relative time for recent dates', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const fields = {
        title: 'Test Event',
        date: oneHourAgo
      };

      const result = renderSmokeSignal(fields as any);
      const dateEl = result.querySelector('.event-date');
      const relativeTime = dateEl?.querySelector('.event-date-relative');

      expect(relativeTime).toBeTruthy();
      expect(relativeTime?.textContent).toContain('ago');
    });

    it('should not show relative time for dates more than a week away', () => {
      const twoWeeksAgo = new Date('2024-01-01T10:00:00Z');

      const fields = {
        title: 'Test Event',
        date: twoWeeksAgo
      };

      const result = renderSmokeSignal(fields as any);
      const dateEl = result.querySelector('.event-date');
      const relativeTime = dateEl?.querySelector('.event-date-relative');

      expect(relativeTime).toBeFalsy();
    });
  });

  describe('Location Rendering', () => {
    it('should render location from location field', () => {
      const fields = {
        title: 'Test Event',
        $raw: {
          location: 'San Francisco, CA'
        }
      };

      const result = renderSmokeSignal(fields as any);
      const locationEl = result.querySelector('.event-location');

      expect(locationEl).toBeTruthy();
      expect(locationEl?.textContent).toContain('San Francisco, CA');
    });

    it('should render location from venue field', () => {
      const fields = {
        title: 'Test Event',
        $raw: {
          venue: 'Convention Center'
        }
      };

      const result = renderSmokeSignal(fields as any);
      const locationEl = result.querySelector('.event-location');

      expect(locationEl).toBeTruthy();
      expect(locationEl?.textContent).toContain('Convention Center');
    });

    it('should render location from where field', () => {
      const fields = {
        title: 'Test Event',
        $raw: {
          where: 'Online'
        }
      };

      const result = renderSmokeSignal(fields as any);
      const locationEl = result.querySelector('.event-location');

      expect(locationEl).toBeTruthy();
      expect(locationEl?.textContent).toContain('Online');
    });

    it('should handle location object with name property', () => {
      const fields = {
        title: 'Test Event',
        $raw: {
          location: {
            name: 'Event Venue',
            address: '123 Main St'
          }
        }
      };

      const result = renderSmokeSignal(fields as any);
      const locationEl = result.querySelector('.event-location');

      expect(locationEl).toBeTruthy();
      expect(locationEl?.textContent).toContain('Event Venue');
    });
  });

  describe('Image Rendering', () => {
    it('should render event image when available', () => {
      const fields = {
        title: 'Test Event',
        image: 'https://example.com/event-image.jpg'
      };

      const result = renderSmokeSignal(fields as any);
      const imgContainer = result.querySelector('.event-image');
      const img = imgContainer?.querySelector('img');

      expect(imgContainer).toBeTruthy();
      expect(img).toBeTruthy();
      expect(img?.getAttribute('src')).toBe('https://example.com/event-image.jpg');
      expect(img?.getAttribute('alt')).toContain('Test Event');
      expect(img?.getAttribute('loading')).toBe('lazy');
    });

    it('should handle image object with url property', () => {
      const fields = {
        title: 'Test Event',
        image: {
          url: 'https://example.com/image.jpg',
          alt: 'Event image'
        }
      };

      const result = renderSmokeSignal(fields as any);
      const img = result.querySelector('.event-image img');

      expect(img).toBeTruthy();
      expect(img?.getAttribute('src')).toBe('https://example.com/image.jpg');
    });

    it('should not render image section when image is missing', () => {
      const fields = {
        title: 'Test Event'
      };

      const result = renderSmokeSignal(fields as any);
      const imgContainer = result.querySelector('.event-image');

      expect(imgContainer).toBeFalsy();
    });
  });

  describe('Content Rendering', () => {
    it('should render event description', () => {
      const fields = {
        title: 'Test Event',
        content: 'This is a detailed event description.'
      };

      const result = renderSmokeSignal(fields as any);
      const desc = result.querySelector('.event-description');

      expect(desc).toBeTruthy();
      expect(desc?.textContent).toBe('This is a detailed event description.');
      expect(desc?.getAttribute('role')).toBe('article');
    });

    it('should handle non-string content', () => {
      const fields = {
        title: 'Test Event',
        content: 12345
      };

      const result = renderSmokeSignal(fields as any);
      const desc = result.querySelector('.event-description');

      expect(desc).toBeTruthy();
      expect(desc?.textContent).toBe('12345');
    });
  });

  describe('URL Handling', () => {
    it('should make title a link when URL is available', () => {
      const fields = {
        title: 'Test Event',
        url: 'https://example.com/event'
      };

      const result = renderSmokeSignal(fields as any);
      const titleLink = result.querySelector('.event-title a');

      expect(titleLink).toBeTruthy();
      expect(titleLink?.getAttribute('href')).toBe('https://example.com/event');
      expect(titleLink?.getAttribute('target')).toBe('_blank');
      expect(titleLink?.getAttribute('rel')).toBe('noopener noreferrer');
      expect(titleLink?.textContent).toBe('Test Event');
    });

    it('should not make title a link when URL is missing', () => {
      const fields = {
        title: 'Test Event'
      };

      const result = renderSmokeSignal(fields as any);
      const titleLink = result.querySelector('.event-title a');
      const titleText = result.querySelector('.event-title');

      expect(titleLink).toBeFalsy();
      expect(titleText?.textContent).toBe('Test Event');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      const fields = {
        title: 'Test Event',
        date: new Date()
      };

      const result = renderSmokeSignal(fields as any);

      expect(result.getAttribute('aria-label')).toBe('Event');

      const badge = result.querySelector('.event-type-badge');
      expect(badge?.getAttribute('role')).toBe('status');
      expect(badge?.getAttribute('aria-label')).toContain('Event type');

      const dateEl = result.querySelector('.event-date');
      expect(dateEl?.getAttribute('aria-label')).toBeTruthy();
    });
  });

  describe('Integration with Field Extractor', () => {
    it('should work with extracted fields from record', () => {
      const record = {
        value: {
          $type: 'com.example.event',
          title: 'Test Event',
          description: 'Event description',
          startDate: '2024-12-20T10:00:00Z',
          location: 'San Francisco',
          isHosting: true
        }
      };

      const fields = extractFields(record);
      const result = renderSmokeSignal(fields, record);

      expect(result).toBeTruthy();
      const title = result.querySelector('.event-title');
      expect(title?.textContent).toBe('Test Event');
    });

    it('should handle unknown lexicon with heuristic extraction', () => {
      const record = {
        value: {
          $type: 'unknown.event.type',
          name: 'Unknown Event',
          text: 'Event description',
          createdAt: '2024-12-20T10:00:00Z'
        }
      };

      const fields = extractFields(record);
      const result = renderSmokeSignal(fields, record);

      expect(result).toBeTruthy();
      const title = result.querySelector('.event-title');
      expect(title).toBeTruthy();
    });
  });
});
