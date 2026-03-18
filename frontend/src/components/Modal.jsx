import React from 'react';

export default function Modal({ title, onClose, children, width = '80%', height = '80%' }) {
    return (
        <div style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', zIndex: 6000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: width, maxHeight: height, overflow: 'auto', background: '#fff', padding: 16, borderRadius: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h3 style={{ margin: 0 }}>{title}</h3>
                    <div>
                        <button onClick={onClose}>关闭</button>
                    </div>
                </div>
                {children}
            </div>
        </div>
    );
}
