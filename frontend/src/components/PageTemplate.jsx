import React, { useState } from 'react';
import Button from './Button';

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
    const rootStyle = {
        minHeight: 'var(--app-height, 100vh)',
        background: 'var(--color-bg-base)',
        padding: 20,
        boxSizing: 'border-box',
        color: 'var(--color-text-primary)',
        ...(extraStyle || {})
    };

    const breadcrumbStyle = { color: 'var(--color-text-secondary)', fontSize: 16, marginBottom: 12 };
    const cardStyle = { background: 'var(--color-bg-surface)', borderRadius: 'var(--radius-md)', padding: 16, border: '1px solid var(--color-border)', boxShadow: '0 8px 24px var(--color-glow)' };

    return (
        <div style={rootStyle}>
            <div style={{ maxWidth: 960, margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, marginTop: 50 }}>
                    <h2 style={{ margin: 0 }}>{title || '住民设置'}</h2>
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
                                            <span style={{ margin: '0 8px', color: 'var(--color-text-muted)' }}>{'>'}</span>
                                        </>
                                    ) : (
                                        <span>{b.label}</span>
                                    )}
                                </span>
                            );
                        })}
                        <Button themeAware onClick={onBack || (breadcrumb[0] && breadcrumb[0].onClick)} style={{ padding: '0 8px', border: 0, alignItems: 'center', display: 'inline-flex', gap: 4, background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', textAlign: 'right', float: 'right' }}>
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
