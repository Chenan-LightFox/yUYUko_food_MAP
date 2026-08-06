import React from 'react';
import ScrollableView from './ScrollableView';

export default function Modal({ title, onClose, children, width = '80%', height = '80%' }) {
    const overlayStyle = { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, background: 'var(--color-backdrop)', zIndex: 6000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
    const boxStyle = { width: width, maxHeight: height, overflow: 'auto', background: 'var(--color-bg-surface)', padding: 16, borderRadius: 10, border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', boxShadow: 'var(--shadow-surface)' };
    const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 };
    const closeBtnStyle = { border: 'none', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' };

    return (
        <div style={overlayStyle}>
            <ScrollableView style={boxStyle}>
                <div style={headerStyle}>
                    <h3 style={{ margin: 0 }}>{title}</h3>
                    <div>
                        <button onClick={onClose} style={closeBtnStyle}>关闭</button>
                    </div>
                </div>
                {children}
            </ScrollableView>
        </div>
    );
}
