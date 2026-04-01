import React from 'react';

export default function Button({ children, onClick, disabled, style, title }) {
    const base = {
        padding: '6px 10px',
        borderRadius: 4,
        border: '1px solid #ccc',
        background: '#fff',
        cursor: 'pointer'
    };

    const userStyle = style || {};
    // Merge base and user style first
    const merged = { ...base, ...userStyle };

    // If disabled, apply disabled appearance but do not override explicit user-provided colors/styles
    if (disabled) {
        if (userStyle.background === undefined) merged.background = '#f5f5f5';
        if (userStyle.color === undefined) merged.color = '#999';
        if (userStyle.border === undefined) merged.border = '1px solid #e6e6e6';
        merged.cursor = 'not-allowed';
        if (userStyle.opacity === undefined) merged.opacity = 0.9;
    }

    return (
        <button onClick={onClick} disabled={disabled} title={title} style={merged}>{children}</button>
    );
}
