import React from 'react';
import useDarkMode from '../hooks/useDarkMode';

function isJsonString(v) {
    if (typeof v !== 'string') return false;
    v = v.trim();
    if (!v) return false;
    return (v[0] === '{' || v[0] === '[' || v[0] === '"' || v === 'null' || v === 'true' || v === 'false' || /^[0-9\-]/.test(v));
}

export default function JsonTable({ value, maxWidth = 420 }) {
    const dark = useDarkMode();

    let parsed = value;
    if (typeof value === 'string' && isJsonString(value)) {
        try {
            parsed = JSON.parse(value);
        } catch (e) {
            parsed = value;
        }
    }

    const renderValue = (v) => {
        if (v === null || v === undefined) return <span style={{ color: dark ? '#9ca3af' : '#666' }}>-</span>;
        if (typeof v === 'boolean' || typeof v === 'number') return String(v);
        if (typeof v === 'string') {
            if (v.length > 200) return <div title={v} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth }}>{v}</div>;
            return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{v}</div>;
        }
        if (Array.isArray(v)) {
            return (
                <div style={{ paddingLeft: 8 }}>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {v.map((it, i) => (<li key={i} style={{ marginBottom: 4 }}>{renderValue(it)}</li>))}
                    </ul>
                </div>
            );
        }
        if (typeof v === 'object') {
            const keys = Object.keys(v);
            if (keys.length === 0) return <span style={{ color: dark ? '#9ca3af' : '#666' }}>{'{}'}</span>;
            return (
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <tbody>
                        {keys.map(k => (
                            <tr key={k}>
                                <td style={{ verticalAlign: 'top', padding: 6, fontWeight: 600, width: '30%', color: dark ? '#e5e7eb' : undefined }}>{k}</td>
                                <td style={{ verticalAlign: 'top', padding: 6 }}>{renderValue(v[k])}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            );
        }
        return String(v);
    };

    // primitives and long strings
    if (typeof parsed !== 'object' || parsed === null) {
        return <div style={{ maxWidth, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(parsed)}</div>;
    }

    return (
        <div style={{ maxWidth }}>
            {renderValue(parsed)}
        </div>
    );
}
