import { HEADING_FONT_OPTIONS, BODY_FONT_OPTIONS, getHeadingFontOption, getBodyFontOption } from '../themes/fonts';
import { getConfig, updateConfig } from '../config';

export function showFontModal(): void {
  const config = getConfig();

  const currentHeadingId = config.fontHeading || 'work-sans';
  const currentBodyId = config.fontBody || 'work-sans';

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'font-modal-backdrop';

  // Content
  const content = document.createElement('div');
  content.className = 'font-modal-content';

  const title = document.createElement('h2');
  title.textContent = 'Fonts';
  content.appendChild(title);

  // Heading select
  const headingLabel = document.createElement('label');
  headingLabel.textContent = 'Headings';
  headingLabel.setAttribute('for', 'font-heading-select');
  content.appendChild(headingLabel);

  const headingSelect = document.createElement('select');
  headingSelect.id = 'font-heading-select';
  for (const opt of HEADING_FONT_OPTIONS) {
    const option = document.createElement('option');
    option.value = opt.id;
    option.textContent = opt.label;
    if (opt.id === currentHeadingId) option.selected = true;
    headingSelect.appendChild(option);
  }
  content.appendChild(headingSelect);

  // Body select
  const bodyLabel = document.createElement('label');
  bodyLabel.textContent = 'Body';
  bodyLabel.setAttribute('for', 'font-body-select');
  content.appendChild(bodyLabel);

  const bodySelect = document.createElement('select');
  bodySelect.id = 'font-body-select';
  for (const opt of BODY_FONT_OPTIONS) {
    const option = document.createElement('option');
    option.value = opt.id;
    option.textContent = opt.label;
    if (opt.id === currentBodyId) option.selected = true;
    bodySelect.appendChild(option);
  }
  content.appendChild(bodySelect);

  // Live preview handler
  function applyFonts() {
    const headingOpt = getHeadingFontOption(headingSelect.value);
    const bodyOpt = getBodyFontOption(bodySelect.value);
    const root = document.documentElement;
    root.style.setProperty('--font-heading', headingOpt.css);
    root.style.setProperty('--font-body', bodyOpt.css);

    // Update in-memory config
    updateConfig({
      fontHeading: headingSelect.value,
      fontBody: bodySelect.value,
      theme: {
        ...config.theme,
        fonts: {
          heading: headingOpt.css,
          body: bodyOpt.css,
        }
      }
    });
  }

  headingSelect.addEventListener('change', applyFonts);
  bodySelect.addEventListener('change', applyFonts);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'font-modal-actions';

  const doneBtn = document.createElement('button');
  doneBtn.className = 'button button-primary';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', close);
  actions.appendChild(doneBtn);
  content.appendChild(actions);

  backdrop.appendChild(content);
  document.body.appendChild(backdrop);

  function close() {
    backdrop.remove();
  }

  // Close on backdrop click
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  // Close on Escape
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKeyDown);
    }
  }
  document.addEventListener('keydown', onKeyDown);
}
