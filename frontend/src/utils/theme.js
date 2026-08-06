export const DEFAULT_PRIMARY = '#E2789F';
export const DEFAULT_SECONDARY = '#8C6BB1';
export const DEFAULT_DARK_PRIMARY = '#FF8FB1';
export const DEFAULT_DARK_SECONDARY = '#A882DD';

export function applyDarkMode(enabled) {
    if (typeof document === 'undefined') return;
    try {
        const root = document.documentElement;
        if (enabled) {
            root.setAttribute('data-theme', 'dark');
        } else {
            root.removeAttribute('data-theme');
        }
        try {
            if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
                window.dispatchEvent(new CustomEvent('themechange', { detail: { dark: !!enabled } }));
            }
        } catch (e) { /* ignore */ }
    } catch (e) {
        // ignore
    }
}

export function isDarkMode() {
    if (typeof document === 'undefined') return false;
    return document.documentElement && document.documentElement.getAttribute('data-theme') === 'dark';
}

export function getSystemPrefersDark() {
    if (typeof window === 'undefined') return false;
    try {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {
        return false;
    }
}

// Returns a cleanup function. Callback receives (isDark: boolean).
export function onSystemColorSchemeChange(callback) {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    try {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e) => callback(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    } catch (e) {
        return () => {};
    }
}

export function hexToRgba(hex, a = 1) {
    try {
        let h = (hex || '').replace('#', '');
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        const bigint = parseInt(h, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r},${g},${b},${a})`;
    } catch (e) {
        return `rgba(0,0,0,${a})`;
    }
}

export function parseColorToRgb(color) {
    if (!color || typeof color !== 'string') return null;
    const c = color.trim().toLowerCase();

    if (c.startsWith('#')) {
        let hex = c.slice(1);
        if (hex.length === 3 || hex.length === 4) {
            hex = hex.split('').map(ch => ch + ch).join('');
        }
        if (hex.length !== 6 && hex.length !== 8) return null;
        const int = parseInt(hex.slice(0, 6), 16);
        if (Number.isNaN(int)) return null;
        return {
            r: (int >> 16) & 255,
            g: (int >> 8) & 255,
            b: int & 255
        };
    }

    const m = c.match(/^rgba?\(([^)]+)\)$/);
    if (!m) return null;
    const parts = m[1].split(',').map(v => v.trim());
    if (parts.length < 3) return null;
    const r = Number(parts[0]);
    const g = Number(parts[1]);
    const b = Number(parts[2]);
    if ([r, g, b].some(v => Number.isNaN(v) || v < 0 || v > 255)) return null;
    return { r, g, b };
}

export function colorToRgba(color, alpha = 1) {
    const rgb = parseColorToRgb(color);
    if (!rgb) return `rgba(0,0,0,${alpha})`;
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

export function darkenColor(color, factor = 0.15) {
    const rgb = parseColorToRgb(color);
    if (!rgb) return color || '#000';
    const r = Math.max(0, Math.round(rgb.r * (1 - factor)));
    const g = Math.max(0, Math.round(rgb.g * (1 - factor)));
    const b = Math.max(0, Math.round(rgb.b * (1 - factor)));
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

export function srgbToLinear(v) {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

export function pickContrastTextColor(bgColor) {
    const rgb = parseColorToRgb(bgColor);
    if (!rgb) return '#2B2533';
    const luminance = 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
    const contrastWithBlack = (luminance + 0.05) / 0.05;
    const contrastWithWhite = 1.05 / (luminance + 0.05);
    return contrastWithBlack >= contrastWithWhite ? '#2B2533' : '#F3EFEF';
}

// Resolve the effective primary color: user overrides or dark/light default
export function resolveThemePrimary(userSettings) {
    const ms = userSettings || {};
    if (ms.theme_color) return ms.theme_color;
    return isDarkMode() ? DEFAULT_DARK_PRIMARY : DEFAULT_PRIMARY;
}

// Resolve the effective secondary color: user overrides or dark/light default
export function resolveThemeSecondary(userSettings) {
    const ms = userSettings || {};
    if (ms.theme_color_secondary) return ms.theme_color_secondary;
    return isDarkMode() ? DEFAULT_DARK_SECONDARY : DEFAULT_SECONDARY;
}

export function applyThemeColor(color) {
    if (typeof document === 'undefined') return;
    try {
        const root = document.documentElement;
        const val = (color || '').trim();
        if (val) {
            root.style.setProperty('--theme-primary', val);
            root.style.setProperty('--theme-primary-0-2', hexToRgba(val, 0.2));
            root.style.setProperty('--theme-primary-0-25', hexToRgba(val, 0.25));
        } else {
            root.style.removeProperty('--theme-primary');
            root.style.removeProperty('--theme-primary-0-2');
            root.style.removeProperty('--theme-primary-0-25');
        }
    } catch (e) { /* ignore */ }
}

export function applyThemeSecondary(color) {
    if (typeof document === 'undefined') return;
    try {
        const root = document.documentElement;
        const val = (color || '').trim();
        if (val) {
            root.style.setProperty('--theme-secondary', val);
            root.style.setProperty('--theme-secondary-0-12', hexToRgba(val, 0.12));
            root.style.setProperty('--theme-secondary-0-2', hexToRgba(val, 0.2));
        } else {
            root.style.removeProperty('--theme-secondary');
            root.style.removeProperty('--theme-secondary-0-12');
            root.style.removeProperty('--theme-secondary-0-2');
        }
    } catch (e) { /* ignore */ }
}

// Apply both primary and secondary together, dispatching a single event
export function applyThemeColors(primary, secondary) {
    applyThemeColor(primary);
    applyThemeSecondary(secondary);
    // Set icon color: in light mode use dark primary, in dark mode keep light
    try {
        const root = document.documentElement;
        const iconColor = secondary || (isDarkMode() ? DEFAULT_DARK_SECONDARY : DEFAULT_SECONDARY);
        root.style.setProperty('--theme-icon', iconColor);
    } catch (e) { /* ignore */ }
    try {
        if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
            window.dispatchEvent(new CustomEvent('themechange', {
                detail: {
                    color: (primary || '').trim(),
                    secondary: (secondary || '').trim()
                }
            }));
        }
    } catch (e) { /* ignore */ }
}

export function getThemeColor() {
    if (typeof document === 'undefined') return null;
    try {
        const s = getComputedStyle(document.documentElement).getPropertyValue('--theme-primary');
        return s ? s.trim() : null;
    } catch (e) {
        return null;
    }
}

export function getThemeSecondary() {
    if (typeof document === 'undefined') return null;
    try {
        const s = getComputedStyle(document.documentElement).getPropertyValue('--theme-secondary');
        return s ? s.trim() : null;
    } catch (e) {
        return null;
    }
}

export default { applyDarkMode, isDarkMode };
