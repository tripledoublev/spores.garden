/**
 * <site-config> - Garden configuration editor
 *
 * Displays a form for editing garden-level configuration:
 * - Title (H1)
 * - Subtitle (H2)
 */

import { getConfig, updateConfig, updateTheme } from '../config';
import { getThemePresets, getThemePreset, getPresetColors, generateThemeFromDid } from '../themes/engine';
import { applyTheme } from '../themes/engine';
import { getCurrentDid } from '../oauth';

class SiteConfig extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    const config = getConfig();
    const theme = config.theme || { preset: 'minimal' };
    const presets = getThemePresets();

    // Get preset defaults for the current preset
    const presetTheme = getThemePreset(theme.preset) || getThemePreset('minimal');
    const presetColors = presetTheme?.colors || {};

    // Helper to get effective color value (custom override or preset default)
    // This is what the color picker should show
    const getEffectiveColor = (colorName: string) => {
      return theme.colors?.[colorName] || presetColors[colorName] || '#000000';
    };

    // Helper to get display value for text input (empty if using preset default)
    const getDisplayColor = (colorName: string) => {
      return theme.colors?.[colorName] || '';
    };

    this.innerHTML = `
      <div class="site-config">
        <div class="site-config-header">
          <h3>Garden Configuration</h3>
        </div>
        <div class="site-config-content">
          <div class="site-config-section">
            <label class="label">Title (H1)</label>
            <input 
              type="text" 
              class="input" 
              id="config-title" 
              value="${(config.title || '').replace(/"/g, '&quot;')}" 
              placeholder="Site title"
              maxlength="100"
            />
          </div>

          <div class="site-config-section">
            <label class="label">Subtitle (H2)</label>
            <input 
              type="text" 
              class="input" 
              id="config-subtitle" 
              value="${((config.subtitle || '').replace(/"/g, '&quot;'))}" 
              placeholder="Site subtitle"
              maxlength="200"
            />
          </div>

        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    // Title - update config and header directly without full re-render
    const titleInput = this.querySelector('#config-title');
    titleInput.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      updateConfig({ title: value });
      // Update header directly to avoid full re-render
      const titleEl = document.querySelector('.site-title');
      if (titleEl) {
        titleEl.textContent = value || 'spores.garden';
      }
    });

    // Subtitle - update config and header directly without full re-render
    const subtitleInput = this.querySelector('#config-subtitle');
    subtitleInput.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      updateConfig({ subtitle: value });
      // Update header directly to avoid full re-render
      const subtitleEl = document.querySelector('.site-subtitle');
      if (subtitleEl) {
        subtitleEl.textContent = value || 'A personal ATProto website';
      }
    });

  }
}

customElements.define('site-config', SiteConfig);