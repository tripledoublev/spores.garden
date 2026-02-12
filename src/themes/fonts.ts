export interface FontOption {
  id: string;
  label: string;
  css: string;
}

export const HEADING_FONT_OPTIONS: FontOption[] = [
  { id: 'work-sans', label: 'Sans Serif',      css: "'Work Sans', sans-serif" },
  { id: 'georgia',   label: 'Serif',            css: "Georgia, serif" },
  { id: 'jetbrains-mono', label: 'Monospace (Tech)', css: "'JetBrains Mono', monospace" },
  { id: 'courier-new',   label: 'Monospace (Type)', css: "'Courier New', Courier, monospace" },
];

export const BODY_FONT_OPTIONS: FontOption[] = [
  { id: 'work-sans', label: 'Sans Serif',      css: "'Work Sans', sans-serif" },
  { id: 'georgia',   label: 'Serif',            css: "Georgia, serif" },
  { id: 'jetbrains-mono', label: 'Monospace (Tech)', css: "'JetBrains Mono', monospace" },
  { id: 'courier-new',   label: 'Monospace (Type)', css: "'Courier New', Courier, monospace" },
];

export const DEFAULT_FONT_ID = 'work-sans';

export function getHeadingFontOption(id?: string): FontOption {
  return HEADING_FONT_OPTIONS.find(o => o.id === id) || HEADING_FONT_OPTIONS[0];
}

export function getBodyFontOption(id?: string): FontOption {
  return BODY_FONT_OPTIONS.find(o => o.id === id) || BODY_FONT_OPTIONS[0];
}

export function getDefaultFontPairing(): { heading: string; body: string } {
  return {
    heading: HEADING_FONT_OPTIONS[0].css,
    body: BODY_FONT_OPTIONS[0].css,
  };
}
