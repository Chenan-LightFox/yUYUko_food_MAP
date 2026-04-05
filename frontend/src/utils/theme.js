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

function hexToRgba(hex, a = 1) {
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
        try {
            if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
                window.dispatchEvent(new CustomEvent('themechange', { detail: { color: val } }));
            }
        } catch (e) { /* ignore */ }
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

export default { applyDarkMode, isDarkMode };
