import React from 'react';
import Button from './components/Button';
import Tooltip from './components/Tooltip';

export default function Settings({ user, onBack, onOpenEditUsername }) {
    return (
        <div style={{ minHeight: 'var(--app-height, 100vh)', background: '#f6f7f9', padding: 20, boxSizing: 'border-box' }}>
            <div style={{ maxWidth: 960, margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h2 style={{ margin: 0 }}>用户设置</h2>
                </div>

                <div style={{ marginBottom: 14, color: '#666', fontSize: 16 }}>
                    <span>设置</span> <span style={{ margin: '0 8px', color: '#9ca3af' }}>{'>'}</span>
                </div>

                <div style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div><strong>当前用户名：</strong>{user ? user.username : '-'}</div>
                        <div>
                            <Tooltip text="修改用户名" placement="top">
                                <Button onClick={onOpenEditUsername} style={{ padding: '8px 12px', border: 0, alignItems: 'center', display: 'inline-flex', gap: 4 }}>
                                    <span className="material-symbols-outlined">chevron_right</span>
                                </Button>
                            </Tooltip>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
