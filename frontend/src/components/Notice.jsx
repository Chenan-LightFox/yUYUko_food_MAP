import React, { forwardRef } from 'react';
import useDarkMode from '../utils/useDarkMode';

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

function pickBorderColor(bgColor) {
    const rgb = parseColorToRgb(bgColor);
    if (!rgb) return 'rgba(0, 0, 0, 0.12)';
    const luminance = 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
    return luminance > 0.6 ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.2)';
}

const TONE_COLORS = {
    info: {
        light: { bg: '#e8f1ff', border: '#b6d4ff', text: '#0b3d91' },
        dark: { bg: '#0f1f3a', border: '#1f2f52', text: '#dbe7ff' }
    },
    warning: {
        light: { bg: '#fff7e6', border: '#ffd591', text: '#8a5200' },
        dark: { bg: '#0f172a', border: '#1f2a44', text: '#e5e7eb' }
    },
    danger: {
        light: { bg: '#fff6f6', border: '#ffd6d6', text: '#8b0000' },
        dark: { bg: '#3b0b0b', border: '#6b1414', text: '#ffd6d6' }
    }
};

const Notice = forwardRef(function Notice({ title, children, tone = 'info', backgroundColor, canClose = false, onClose, zIndex = 3000, style }, ref) {
    const dark = useDarkMode();
    const palette = (TONE_COLORS[tone] || TONE_COLORS.info)[dark ? 'dark' : 'light'];
    const hasCustomBackground = typeof backgroundColor === 'string' && backgroundColor.trim();
    const mergedBackground = hasCustomBackground ? backgroundColor : palette.bg;
    const mergedBorder = hasCustomBackground ? pickBorderColor(mergedBackground) : palette.border;
    const mergedText = hasCustomBackground ? pickContrastTextColor(mergedBackground) : palette.text;

    const rootStyle = {
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(960px, calc(100% - 24px))',
        maxWidth: '960px',
        minWidth: 0,
        boxSizing: 'border-box',
        zIndex,
        padding: '12px 16px',
        borderRadius: 8,
        background: mergedBackground,
        border: `1px solid ${mergedBorder}`,
        color: mergedText,
        textAlign: 'center',
        boxShadow: dark ? '0 2px 10px rgba(0,0,0,0.6)' : '0 2px 10px rgba(0,0,0,0.12)',
        ...style
    };

    const closeBtnStyle = {
        position: 'absolute',
        top: 6,
        right: 8,
        border: 'none',
        background: 'transparent',
        color: mergedText,
        fontSize: 16,
        cursor: 'pointer',
        lineHeight: '1'
    };

    return (
        <div ref={ref} style={rootStyle}>
            {canClose && (
                <button aria-label="关闭" style={closeBtnStyle} onClick={onClose}>×</button>
            )}
            {title && <div style={{ fontWeight: 700 }}>{title}</div>}
            {children && <div style={{ marginTop: title ? 6 : 0 }}>{children}</div>}
        </div>
    );
});

export default Notice;
