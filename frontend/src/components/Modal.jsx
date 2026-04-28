import React from 'react';
import useDarkMode from '../hooks/useDarkMode';
import ScrollableView from './ScrollableView';

export default function Modal({ title, onClose, children, width = '80%', height = '80%' }) {
    const dark = useDarkMode();

    const overlayStyle = { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, background: dark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)', zIndex: 6000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
    const boxStyle = { width: width, maxHeight: height, overflow: 'auto', background: dark ? '#0b1220' : '#fff', padding: 16, borderRadius: 6, color: dark ? '#e5e7eb' : 'inherit' };
    const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 };
    const closeBtnStyle = { border: 'none', background: 'transparent', color: dark ? '#e5e7eb' : '#000', cursor: 'pointer' };

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
