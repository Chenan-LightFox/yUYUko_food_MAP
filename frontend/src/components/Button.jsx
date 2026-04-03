import React, { useState } from 'react';
import useDarkMode from '../hooks/useDarkMode';

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

    // If this button should adapt to panel theme (admin/settings), adjust defaults for dark mode
    if (themeAware) {
        if (variant === 'menu') {
            base.color = dark ? '#e5e7eb' : (base.color || 'inherit');
        } else {
            base.background = dark ? '#111827' : base.background;
            base.border = dark ? '1px solid #374151' : base.border;
            base.color = dark ? '#e5e7eb' : (base.color || 'inherit');
        }
    }

    if (full) {
        base.display = 'block';
        base.width = '100%';
        base.boxSizing = 'border-box';
    }

    const hoverStyle = hover ? (variant === 'menu' ? (themeAware && dark ? { background: '#0b1220' } : { background: '#f3f4f6' }) : { opacity: 0.98 }) : {};

    const userStyle = style || {};
    const merged = { ...base, ...userStyle, ...hoverStyle };

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
