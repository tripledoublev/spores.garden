import { extractFields } from '../records/field-extractor';
import { createErrorMessage, createLoadingSpinner } from '../utils/loading-states';

/**
 * Smoke Signal Events Layout
 * 
 * Displays Smoke Signal events (hosting and attending).
 * Uses generic field extraction to work with various event record structures.
 * For RSVPs, fetches the referenced event to display meaningful information.
 */

/**
 * Render a smoke signal event record
 * 
 * @param fields - Extracted fields from the record
 * @param record - Optional original record reference
 */
export function renderSmokeSignal(fields: ReturnType<typeof extractFields>, record?: any): HTMLElement {
  const el = document.createElement('article');
  el.className = 'layout-smoke-signal';
  el.setAttribute('aria-label', 'Event');

  const $type = fields.$type || '';
  const $raw = fields.$raw || {};

  // Check if this is an RSVP that needs event data fetched
  const isRsvp = $type === 'community.lexicon.calendar.rsvp' || $type.includes('calendar.rsvp');
  
  if (isRsvp && $raw.subject?.uri) {
    // Show loading state while we fetch the event
    const loadingEl = createLoadingSpinner('Loading event...');
    el.appendChild(loadingEl);
    
    // Fetch event data asynchronously
    fetchAndRenderRsvp(el, fields, $raw).catch(error => {
      console.error('Failed to fetch RSVP event:', error);
      el.innerHTML = '';
      el.appendChild(createErrorMessage('Failed to load event details'));
    });
    
    return el;
  }

  // Regular event rendering
  renderEventContent(el, fields, record);
  return el;
}

/**
 * Fetch event data for an RSVP and render it
 */
async function fetchAndRenderRsvp(el: HTMLElement, fields: ReturnType<typeof extractFields>, $raw: any): Promise<void> {
  const subjectUri = $raw.subject?.uri;
  
  try {
    const { getRecordByUri } = await import('../records/loader');
    const eventRecord = await getRecordByUri(subjectUri);
    
    if (eventRecord?.value) {
      // Extract fields from the event record
      const eventFields = extractFields(eventRecord);
      
      // Merge RSVP status into event fields for display
      const mergedFields = {
        ...eventFields,
        // Keep the RSVP's $type and $raw for status badge
        $type: fields.$type,
        $raw: fields.$raw,
        // Use event's content if RSVP doesn't have its own
        title: eventFields.title || fields.title,
        content: eventFields.content || fields.content,
        date: eventFields.date || fields.date,
        url: eventFields.url || fields.url,
        image: eventFields.image || fields.image,
      };
      
      el.innerHTML = '';
      renderEventContent(el, mergedFields, eventRecord);
    } else {
      // Couldn't fetch event, render with what we have
      el.innerHTML = '';
      renderEventContent(el, fields, null);
    }
  } catch (error) {
    console.warn('Failed to fetch event for RSVP:', error);
    // Render with what we have
    el.innerHTML = '';
    renderEventContent(el, fields, null);
  }
}

/**
 * Render the event content (used for both events and RSVPs after event fetch)
 */
function renderEventContent(el: HTMLElement, fields: ReturnType<typeof extractFields>, record?: any): void {
  try {
    // Extract event fields using generic extractor
    const title = fields.title || 'Untitled Event';
    const content = fields.content || '';
    const date = fields.date;
    const url = fields.url;
    const image = fields.image;
    const $type = fields.$type || '';
    const $raw = fields.$raw || {};

  // Determine event type (organizing vs attending)
  // Check the lexicon $type to determine the record type
  const isOrganizing = 
    $type === 'community.lexicon.calendar.event' ||
    $type.includes('calendar.event') ||
    $raw.isHosting === true ||
    $raw.hosting === true ||
    $raw.role === 'host' ||
    $raw.eventType === 'hosting';
  
  const isAttending = 
    $type === 'community.lexicon.calendar.rsvp' ||
    $type.includes('calendar.rsvp') ||
    $raw.status?.includes('going') ||
    $raw.status?.includes('interested');

  // Default to organizing if we can't determine (for backwards compatibility)
  const eventTypeClass = isAttending ? 'event-attending' : 'event-hosting';

  // For RSVPs, get the specific status (going, interested, notgoing)
  let eventTypeLabel = isAttending ? 'Attending' : 'Organizing';
  if (isAttending && $raw.status) {
    const status = $raw.status;
    if (status.includes('going') && !status.includes('notgoing')) {
      eventTypeLabel = 'Going';
    } else if (status.includes('interested')) {
      eventTypeLabel = 'Interested';
    } else if (status.includes('notgoing')) {
      eventTypeLabel = 'Not Going';
    }
  }

  // Container
  const container = document.createElement('div');
  container.className = `smoke-signal-event ${eventTypeClass}`;

  // Event type badge - for organizing show "Organizing", for attending just show "RSVP"
  const badge = document.createElement('div');
  badge.className = 'event-type-badge';
  badge.setAttribute('role', 'status');
  const badgeLabel = isAttending ? 'RSVP' : 'Organizing';
  badge.setAttribute('aria-label', `Event type: ${badgeLabel.toLowerCase()}`);
  badge.textContent = badgeLabel;
  container.appendChild(badge);

    // Image (if available)
    if (image) {
      const imgContainer = document.createElement('div');
      imgContainer.className = 'event-image';
      imgContainer.style.position = 'relative';
      
      // Add loading spinner overlay
      const loadingOverlay = document.createElement('div');
      loadingOverlay.className = 'image-loading-overlay';
      loadingOverlay.style.position = 'absolute';
      loadingOverlay.style.top = '0';
      loadingOverlay.style.left = '0';
      loadingOverlay.style.right = '0';
      loadingOverlay.style.bottom = '0';
      loadingOverlay.style.display = 'flex';
      loadingOverlay.style.alignItems = 'center';
      loadingOverlay.style.justifyContent = 'center';
      loadingOverlay.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
      loadingOverlay.style.zIndex = '1';
      
      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      spinner.style.width = '32px';
      spinner.style.height = '32px';
      loadingOverlay.appendChild(spinner);
      imgContainer.appendChild(loadingOverlay);
      
      const img = document.createElement('img');
      const imageUrl = typeof image === 'string' ? image : (image.url || image.href || '');
      img.src = imageUrl;
      img.alt = `${title} - Event image`;
      img.loading = 'lazy';
      img.style.opacity = '0';
      img.style.transition = 'opacity 0.3s ease';
      
      img.addEventListener('load', () => {
        img.style.opacity = '1';
        loadingOverlay.style.display = 'none';
      });
      
      img.addEventListener('error', () => {
        loadingOverlay.style.display = 'none';
        img.style.display = 'none';
        const errorMsg = createErrorMessage(
          'Failed to load event image',
          () => {
            img.src = '';
            img.style.display = '';
            img.style.opacity = '0';
            loadingOverlay.style.display = 'flex';
            img.src = imageUrl;
            const existingError = imgContainer.querySelector('.error-state');
            if (existingError) {
              existingError.remove();
            }
          }
        );
        imgContainer.appendChild(errorMsg);
      });
      
      imgContainer.appendChild(img);
      container.appendChild(imgContainer);
    }

  // Content wrapper
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'event-content';

  // Title (Event name)
  const titleEl = document.createElement('h2');
  titleEl.className = 'event-title';
  if (url) {
    const link = document.createElement('a');
    link.href = url;
    link.textContent = title;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${title} - Opens in new tab`);
    titleEl.appendChild(link);
  } else {
    titleEl.textContent = title;
  }
  contentWrapper.appendChild(titleEl);

  // For RSVPs, show the RSVP status line below the title
  if (isAttending) {
    const rsvpStatusEl = document.createElement('div');
    rsvpStatusEl.className = 'event-rsvp-status';
    rsvpStatusEl.style.fontSize = '0.9em';
    rsvpStatusEl.style.color = 'var(--text-muted)';
    rsvpStatusEl.style.marginBottom = '0.5rem';
    
    const statusEmoji = eventTypeLabel === 'Going' ? '✓' : eventTypeLabel === 'Interested' ? '?' : eventTypeLabel === 'Not Going' ? '✗' : '';
    rsvpStatusEl.textContent = `RSVP: ${statusEmoji} ${eventTypeLabel}`;
    contentWrapper.appendChild(rsvpStatusEl);
  }

  // Date/time
  if (date) {
    const dateEl = document.createElement('time');
    dateEl.className = 'event-date';
    const dateObj = date instanceof Date ? date : new Date(date);
    if (!isNaN(dateObj.getTime())) {
      dateEl.dateTime = dateObj.toISOString();
      // Format date nicely
      const formattedDate = dateObj.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
      dateEl.textContent = formattedDate;
      dateEl.setAttribute('aria-label', `Event date: ${formattedDate}`);
      
      // Add relative time
      const relativeTime = getRelativeTime(dateObj);
      if (relativeTime) {
        const relativeEl = document.createElement('span');
        relativeEl.className = 'event-date-relative';
        relativeEl.setAttribute('aria-label', `Relative time: ${relativeTime}`);
        relativeEl.textContent = ` (${relativeTime})`;
        dateEl.appendChild(relativeEl);
      }
    } else {
      dateEl.textContent = String(date);
      dateEl.setAttribute('datetime', String(date));
    }
    contentWrapper.appendChild(dateEl);
  }

  // Location (look for location field in raw data)
  const location = $raw.location || $raw.venue || $raw.where || $raw.address;
  if (location) {
    const locationEl = document.createElement('div');
    locationEl.className = 'event-location';
    locationEl.setAttribute('aria-label', 'Event location');
    const locationText = typeof location === 'string' ? location : (location.name || location.address || JSON.stringify(location));
    locationEl.innerHTML = `<span aria-hidden="true">📍</span> <span>${locationText}</span>`;
    contentWrapper.appendChild(locationEl);
  }

  // Description/content
  if (content) {
    const descEl = document.createElement('div');
    descEl.className = 'event-description';
    descEl.setAttribute('role', 'article');
    // Handle markdown or plain text
    if (typeof content === 'string') {
      descEl.textContent = content;
    } else {
      descEl.textContent = String(content);
    }
    contentWrapper.appendChild(descEl);
  }

    container.appendChild(contentWrapper);
    el.appendChild(container);
  } catch (error) {
    console.error('Failed to render smoke signal event:', error);
    const errorEl = createErrorMessage(
      'Failed to render event',
      undefined,
      error instanceof Error ? error.message : String(error)
    );
    el.appendChild(errorEl);
  }

  return el;
}

/**
 * Get relative time string (e.g., "in 2 days", "3 hours ago")
 */
function getRelativeTime(date: Date): string | null {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (Math.abs(diffDay) > 7) {
    return null; // Don't show relative time for dates > 1 week away
  }

  if (Math.abs(diffSec) < 60) {
    return diffSec >= 0 ? 'soon' : 'just now';
  } else if (Math.abs(diffMin) < 60) {
    const value = Math.abs(diffMin);
    return diffMin >= 0 ? `in ${value} ${value === 1 ? 'minute' : 'minutes'}` : `${value} ${value === 1 ? 'minute' : 'minutes'} ago`;
  } else if (Math.abs(diffHour) < 24) {
    const value = Math.abs(diffHour);
    return diffHour >= 0 ? `in ${value} ${value === 1 ? 'hour' : 'hours'}` : `${value} ${value === 1 ? 'hour' : 'hours'} ago`;
  } else {
    const value = Math.abs(diffDay);
    return diffDay >= 0 ? `in ${value} ${value === 1 ? 'day' : 'days'}` : `${value} ${value === 1 ? 'day' : 'days'} ago`;
  }
}
