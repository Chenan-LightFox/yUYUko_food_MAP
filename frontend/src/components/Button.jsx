import React, { useState } from 'react';
import useDarkMode from '../utils/useDarkMode';
import { getThemeColor } from '../utils/theme';

function parseColorToRgb(color) {
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

function srgbToLinear(v) {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

function pickContrastTextColor(bgColor) {
    const rgb = parseColorToRgb(bgColor);
    if (!rgb) return '#111827';
    const luminance = 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
    const contrastWithBlack = (luminance + 0.05) / 0.05;
    const contrastWithWhite = 1.05 / (luminance + 0.05);
    return contrastWithBlack >= contrastWithWhite ? '#111827' : '#ffffff';
}

function normalizeColorValue(color) {
    return typeof color === 'string' ? color.trim().toLowerCase() : '';
}

export default function Button({ children, onClick, disabled, style, title, variant = 'default', full = false, type = 'button', themeAware = false }) {
    const [hover, setHover] = useState(false);
    const dark = useDarkMode();

    const base = {
        padding: '6px 10px',
        borderRadius: 4,
        border: '1px solid #ccc',
        background: '#fff',
        cursor: 'pointer',
        fontSize: 14,
        textAlign: 'center',
        display: 'inline-block'
    };

    if (variant === 'menu') {
        base.background = 'transparent';
        base.border = 'none';
        base.padding = '8px 10px';
        base.borderRadius = 0;
        base.textAlign = 'left';
    }

    // If caller didn't specify a background, use the user's theme color as default
    const userStyle = style || {};
    const themeColor = getThemeColor();
    const normalizedThemeColor = normalizeColorValue(themeColor);
    const normalizedUserBackground = normalizeColorValue(userStyle.background);
    const isThemeDrivenBackground = variant !== 'menu' && !!themeColor && (
        userStyle.background === undefined || normalizedUserBackground === normalizedThemeColor
    );
    if (userStyle.background === undefined && variant !== 'menu') {
        base.background = themeColor || base.background;
    }

    // If this button should adapt to panel theme (admin/settings), adjust defaults for dark mode
    if (themeAware) {
        if (variant === 'menu') {
            base.color = dark ? '#e5e7eb' : (base.color || 'inherit');
        } else {
            // let theme color override dark panel background when user wants themed buttons
            if (!themeColor) {
                base.background = dark ? '#111827' : base.background;
            }
            base.border = dark ? '1px solid #374151' : base.border;
            base.color = dark ? '#e5e7eb' : (base.color || 'inherit');
        }
    }

    if (full) {
        base.display = 'block';
        base.width = '100%';
        base.boxSizing = 'border-box';
    }

    const hoverStyle = hover ? (variant === 'menu' ? (themeAware && dark ? { background: '#162033' } : { background: '#f3f4f6' }) : { opacity: 0.98 }) : {};

    const merged = { ...base, ...userStyle, ...hoverStyle };

    // For buttons using user custom theme color as background, always switch text to black/white for readability.
    if (!disabled && isThemeDrivenBackground) {
        merged.color = pickContrastTextColor(themeColor);
    }

    // If disabled, apply disabled appearance but do not override explicit user-provided colors/styles
    if (disabled) {
        if (userStyle.background === undefined) merged.background = themeAware && dark ? '#1f2937' : '#f5f5f5';
        if (userStyle.color === undefined) merged.color = themeAware && dark ? '#6b7280' : '#999';
        if (userStyle.border === undefined) merged.border = themeAware && dark ? '1px solid #374151' : '1px solid #e6e6e6';
        merged.cursor = 'not-allowed';
        if (userStyle.opacity === undefined) merged.opacity = 0.9;
    }

    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            title={title}
            style={merged}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            {children}
        </button>
    );
}
