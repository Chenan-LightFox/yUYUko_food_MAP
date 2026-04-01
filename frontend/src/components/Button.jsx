import React from 'react';

export default function Button({ children, onClick, disabled, style, title }) {
    const base = {
        padding: '6px 10px',
        borderRadius: 4,
        border: '1px solid #ccc',
        background: '#fff',
        cursor: 'pointer'
    };

    // Merge base and user style first
    const merged = { ...base, ...(style || {}) };

    // If disabled, enforce disabled appearance (override any user-provided colors)
    if (disabled) {
        merged.background = '#f5f5f5';
        merged.color = merged.color || '#999';
        merged.border = merged.border || '1px solid #e6e6e6';
        merged.cursor = 'not-allowed';
        merged.opacity = merged.opacity || 0.9;
    }

    return (
        <button onClick={onClick} disabled={disabled} title={title} style={merged}>{children}</button>
    );
}
