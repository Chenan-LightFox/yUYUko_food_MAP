import React, { useState } from 'react';

export default function Button({ children, onClick, disabled, style, title, variant = 'default', full = false }) {
    const [hover, setHover] = useState(false);

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

    if (full) {
        base.display = 'block';
        base.width = '100%';
        base.boxSizing = 'border-box';
    }

    const hoverStyle = hover ? (variant === 'menu' ? { background: '#f3f4f6' } : { opacity: 0.98 }) : {};

    const userStyle = style || {};
    const merged = { ...base, ...userStyle, ...hoverStyle };

    // If disabled, apply disabled appearance but do not override explicit user-provided colors/styles
    if (disabled) {
        if (userStyle.background === undefined) merged.background = '#f5f5f5';
        if (userStyle.color === undefined) merged.color = '#999';
        if (userStyle.border === undefined) merged.border = '1px solid #e6e6e6';
        merged.cursor = 'not-allowed';
        if (userStyle.opacity === undefined) merged.opacity = 0.9;
    }

    return (
        <button
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
