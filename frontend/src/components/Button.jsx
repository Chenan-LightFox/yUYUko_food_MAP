import React, { useState } from 'react';
import { getThemeColor, parseColorToRgb, pickContrastTextColor } from '../utils/theme';

function normalizeColorValue(color) {
    return typeof color === 'string' ? color.trim().toLowerCase() : '';
}

export default function Button({ children, onClick, disabled, style, title, variant = 'default', full = false, type = 'button', themeAware = false, ...rest }) {
    const [hover, setHover] = useState(false);
    const base = {
        padding: '6px 10px',
        borderRadius: 4,
        border: '1px solid var(--color-border)',
        background: 'var(--color-bg-surface)',
        color: 'var(--color-text-primary)',
        cursor: 'pointer',
        fontSize: 14,
        textAlign: 'center',
        display: 'inline-block',
        transition: 'background-color 160ms ease, border-color 160ms ease, color 160ms ease, opacity 160ms ease, transform 120ms ease'
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

    // If this button should adapt to panel theme (admin/settings), use semantic surface tokens.
    if (themeAware) {
        if (variant === 'menu') {
            base.color = 'var(--color-text-primary)';
        } else {
            // let theme color override dark panel background when user wants themed buttons
                if (!themeColor) base.background = 'var(--color-bg-overlay)';
                base.border = '1px solid var(--color-border)';
                base.color = 'var(--color-text-primary)';
        }
    }

    if (full) {
        base.display = 'block';
        base.width = '100%';
        base.boxSizing = 'border-box';
    }

    const hoverStyle = hover ? (variant === 'menu' ? { background: 'var(--color-bg-overlay)' } : { opacity: 0.9 }) : {};

    const merged = { ...base, ...userStyle, ...hoverStyle };

    // For buttons using user custom theme color as background, always switch text to black/white for readability.
    if (!disabled && isThemeDrivenBackground) {
        merged.color = pickContrastTextColor(themeColor);
    }

    // If disabled, apply disabled appearance but do not override explicit user-provided colors/styles
    if (disabled) {
        if (userStyle.background === undefined) merged.background = 'var(--color-bg-overlay)';
        if (userStyle.color === undefined) merged.color = 'var(--color-text-muted)';
        if (userStyle.border === undefined) merged.border = '1px solid var(--color-border)';
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
            {...rest}
        >
            {children}
        </button>
    );
}
