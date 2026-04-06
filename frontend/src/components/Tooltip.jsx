import React, { useState } from 'react';
import useDarkMode from '../utils/useDarkMode';

export default function Tooltip({ text, children, placement = 'bottom' }) {
    const [show, setShow] = useState(false);
    const dark = useDarkMode();

    const containerStyle = {
        position: 'relative',
        display: 'inline-block'
    };

    const tooltipStyle = {
        position: 'absolute',
        top: placement === 'bottom' ? 'calc(100% + 6px)' : 'auto',
        bottom: placement === 'top' ? 'calc(100% + 6px)' : 'auto',
        right: 0,
        background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.75)',
        color: dark ? '#e5e7eb' : '#fff',
        padding: '6px 8px',
        borderRadius: 4,
        fontSize: 12,
        whiteSpace: 'nowrap',
        zIndex: 4000,
        boxShadow: dark ? '0 2px 8px rgba(0,0,0,0.6)' : '0 2px 8px rgba(0,0,0,0.25)'
    };

    return (
        <div style={containerStyle} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
            {children}
            {show && <div role="tooltip" style={tooltipStyle}>{text}</div>}
        </div>
    );
}
