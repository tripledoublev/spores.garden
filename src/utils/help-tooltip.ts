/**
 * Reusable help tooltip (?) button + tooltip popup.
 *
 * The tooltip is portalled to document.body so it escapes any
 * containing blocks created by backdrop-filter / transform / etc.
 */

export function createHelpTooltip(text: string): HTMLElement {
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
  tooltip.textContent = text;

  wrapper.appendChild(btn);
  // Tooltip lives on body, not inside the wrapper
  document.body.appendChild(tooltip);

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
    tooltip.style.display = 'block';
    position();
  };
  const hide = () => { tooltip.style.display = 'none'; };

  btn.addEventListener('mouseenter', show);
  btn.addEventListener('mouseleave', hide);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    tooltip.style.display === 'block' ? hide() : show();
  });

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target as Node)) hide();
  });

  return wrapper;
}
