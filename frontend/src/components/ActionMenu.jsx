import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';

export default function ActionMenu({ items = [], label = '更多', disabled = false }) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState(null);
    const buttonRef = useRef(null);

    const close = () => setOpen(false);
    const toggle = () => {
        if (disabled) return;
        if (open) return close();
        const rect = buttonRef.current?.getBoundingClientRect();
        if (rect) {
            const estimatedHeight = Math.min(items.length * 42 + 16, 360);
            const openUpward = rect.bottom + estimatedHeight > window.innerHeight && rect.top > estimatedHeight;
            setPosition(openUpward
                ? { right: Math.max(8, window.innerWidth - rect.right), bottom: window.innerHeight - rect.top + 4 }
                : { right: Math.max(8, window.innerWidth - rect.right), top: rect.bottom + 4 });
        }
        setOpen(true);
    };

    useEffect(() => {
        if (!open) return;
        const onPointer = (event) => {
            if (buttonRef.current?.contains(event.target)) return;
            if (event.target?.closest?.('[data-action-menu-popup="true"]')) return;
            close();
        };
        const onKey = (event) => { if (event.key === 'Escape') close(); };
        const onViewportChange = () => close();
        document.addEventListener('mousedown', onPointer);
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', onViewportChange);
        window.addEventListener('scroll', onViewportChange, true);
        return () => {
            document.removeEventListener('mousedown', onPointer);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', onViewportChange);
            window.removeEventListener('scroll', onViewportChange, true);
        };
    }, [open]);

    return (
        <>
            <span ref={buttonRef} style={{ display: 'inline-block' }}>
                <Button themeAware onClick={toggle} disabled={disabled} aria-haspopup="menu" aria-expanded={open} style={{ minHeight: 38, padding: '7px 10px', whiteSpace: 'nowrap' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 19, verticalAlign: 'middle', marginRight: 3 }}>more_horiz</span>
                    {label}
                </Button>
            </span>
            {open && position && createPortal(
                <div
                    data-action-menu-popup="true"
                    role="menu"
                    style={{
                        position: 'fixed',
                        ...position,
                        zIndex: 10000,
                        minWidth: 190,
                        maxWidth: 'calc(100vw - 16px)',
                        maxHeight: 'min(360px, calc(100vh - 16px))',
                        overflowY: 'auto',
                        padding: 7,
                        borderRadius: 10,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg-surface)',
                        boxShadow: 'var(--shadow-surface)'
                    }}
                >
                    {items.map((item, index) => (
                        <Button
                            key={item.key || `${item.label}-${index}`}
                            themeAware
                            variant="menu"
                            full
                            disabled={item.disabled}
                            onClick={() => {
                                close();
                                item.onClick?.();
                            }}
                            style={{
                                minHeight: 40,
                                justifyContent: 'flex-start',
                                color: item.tone === 'danger' ? 'var(--color-danger)' : item.tone === 'warning' ? 'var(--color-warning)' : 'var(--color-text-primary)'
                            }}
                        >
                            {item.label}
                        </Button>
                    ))}
                </div>,
                document.body
            )}
        </>
    );
}
