import React, { useState } from 'react';
import Button from './Button';
import useDarkMode from '../utils/useDarkMode';

function BreadcrumbLink({ label, onClick, href }) {
    const [hover, setHover] = useState(false);
    return (
        <a
            href={href || '#'}
            onClick={(e) => { e.preventDefault(); if (onClick) onClick(); }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{ color: 'inherit', textDecoration: hover ? 'underline' : 'none', cursor: 'pointer' }}
        >
            {label}
        </a>
    );
}

export default function PageTemplate({ title, onBack, breadcrumb = [], children, extraStyle }) {
    const dark = useDarkMode();

    const rootStyle = {
        minHeight: 'var(--app-height, 100vh)',
        background: dark ? '#0f1724' : '#f6f7f9',
        padding: 20,
        boxSizing: 'border-box',
        color: dark ? '#e5e7eb' : 'inherit',
        ...(extraStyle || {})
    };

    const breadcrumbStyle = { color: dark ? '#9ca3af' : '#6b7280', fontSize: 16, marginBottom: 12 };
    const cardStyle = { background: dark ? '#0b1220' : '#fff', borderRadius: 8, padding: 16, border: `1px solid ${dark ? '#1f2937' : '#e5e7eb'}` };

    return (
        <div style={rootStyle}>
            <div style={{ maxWidth: 960, margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, marginTop: 50 }}>
                    <h2 style={{ margin: 0 }}>{title || '用户设置'}</h2>
                </div>

                {breadcrumb && breadcrumb.length > 0 && (
                    <div style={breadcrumbStyle}>
                        {breadcrumb.map((b, idx) => {
                            const last = idx === breadcrumb.length - 1;
                            return (
                                <span key={idx}>
                                    {!last ? (
                                        <>
                                            <BreadcrumbLink label={b.label} onClick={b.onClick} href={b.href} />
                                            <span style={{ margin: '0 8px', color: dark ? '#6b7280' : '#9ca3af' }}>{'>'}</span>
                                        </>
                                    ) : (
                                        <span>{b.label}</span>
                                    )}
                                </span>
                            );
                        })}
                        <Button themeAware onClick={onBack || (breadcrumb[0] && breadcrumb[0].onClick)} style={{ padding: '0 8px', border: 0, alignItems: 'center', display: 'inline-flex', gap: 4, background: dark ? 'rgb(15,23,36)' : '#ffffff', color: dark ? '#fff' : undefined, textAlign: 'right', float: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18, marginRight: 4 }}>arrow_back</span>
                                <span>返回设置</span>
                            </div>
                        </Button>
                    </div>
                )}

                <div style={cardStyle}>{children}</div>
            </div>
        </div>
    );
}
