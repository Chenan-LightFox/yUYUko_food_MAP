import React from 'react';

export default function Button({ children, onClick, disabled, style, title }) {
    const base = {
        padding: '6px 10px',
        borderRadius: 4,
        border: '1px solid #ccc',
        background: disabled ? '#f5f5f5' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer'
    };
    return (
        <button onClick={onClick} disabled={disabled} title={title} style={{ ...base, ...style }}>{children}</button>
    );
}
