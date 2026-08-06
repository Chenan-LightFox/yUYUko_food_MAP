import React, { useState } from 'react';

export default function Tooltip({ text, children, placement = 'bottom' }) {
    const [show, setShow] = useState(false);
    const containerStyle = {
        position: 'relative',
        display: 'inline-block'
    };

    const tooltipStyle = {
        position: 'absolute',
        top: placement === 'bottom' ? 'calc(100% + 6px)' : 'auto',
        bottom: placement === 'top' ? 'calc(100% + 6px)' : 'auto',
        right: 0,
        background: 'var(--color-bg-overlay)',
        color: 'var(--color-text-primary)',
        border: '1px solid var(--color-border)',
        padding: '6px 8px',
        borderRadius: 4,
        fontSize: 12,
        whiteSpace: 'nowrap',
        zIndex: 4000,
        boxShadow: 'var(--shadow-surface)'
    };

    return (
        <div style={containerStyle} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
            {children}
            {show && <div role="tooltip" style={tooltipStyle}>{text}</div>}
        </div>
    );
}
