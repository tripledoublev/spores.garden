/**
 * Reusable help tooltip (?) button + tooltip popup.
 *
 * The tooltip is portalled to document.body so it escapes any
 * containing blocks created by backdrop-filter / transform / etc.
 */

export function createHelpTooltip(text: string, options: { allowHtml?: boolean } = {}): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.style.position = 'relative';
  wrapper.style.display = 'inline-flex';
  wrapper.style.alignItems = 'center';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'did-info-button';
  btn.setAttribute('aria-label', 'Help');
  btn.textContent = '?';

  const tooltip = document.createElement('div');
  tooltip.className = 'help-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  if (options.allowHtml) {
    tooltip.innerHTML = text;
  } else {
    tooltip.textContent = text;
  }
  tooltip.style.display = 'none';

  wrapper.appendChild(btn);
  // Tooltip lives on body, not inside the wrapper
  document.body.appendChild(tooltip);

  let isVisible = false;
  let ignoreNextClick = false;
  const supportsHover = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const position = () => {
    const rect = btn.getBoundingClientRect();
    const pad = 8;
    tooltip.style.top = `${rect.bottom + pad}px`;

    const tooltipWidth = tooltip.offsetWidth;
    let left = rect.right - tooltipWidth;
    if (left < pad) {
      left = rect.left;
    }
    if (left + tooltipWidth > window.innerWidth - pad) {
      left = window.innerWidth - pad - tooltipWidth;
    }
    tooltip.style.left = `${Math.max(pad, left)}px`;
  };

  const show = () => {
    isVisible = true;
    btn.setAttribute('aria-expanded', 'true');
    tooltip.style.display = 'block';
    position();
  };
  const hide = () => {
    isVisible = false;
    btn.setAttribute('aria-expanded', 'false');
    tooltip.style.display = 'none';
  };
  const toggle = () => {
    if (isVisible) {
      hide();
      return;
    }
    show();
  };

  if (supportsHover) {
    btn.addEventListener('mouseenter', show);
    btn.addEventListener('mouseleave', hide);
  }

  if (typeof window !== 'undefined' && 'PointerEvent' in window) {
    btn.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') {
        ignoreNextClick = true;
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }
    });
  } else {
    btn.addEventListener('touchstart', (e) => {
      ignoreNextClick = true;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    }, { passive: false });
  }

  btn.addEventListener('click', (e) => {
    if (ignoreNextClick) {
      ignoreNextClick = false;
      return;
    }
    e.stopPropagation();
    toggle();
  });

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target as Node)) {
      hide();
    }
  });

  return wrapper;
}
