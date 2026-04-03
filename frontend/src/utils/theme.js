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

export default { applyDarkMode, isDarkMode };
