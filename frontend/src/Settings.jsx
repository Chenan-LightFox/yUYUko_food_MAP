import React, { useState } from 'react';
import Button from './components/Button';
import Tooltip from './components/Tooltip';
import useDarkMode from './hooks/useDarkMode';

export default function Settings({ user, onBack, onOpenEditUsername, onOpenEditPassword, onOpenPersonalize, onOpenThemes, backendUrl, token, onLogout }) {
    const dark = useDarkMode();
    const [deleting, setDeleting] = useState(false);

    const rootStyle = { minHeight: 'var(--app-height, 100vh)', background: dark ? '#0f1724' : '#f6f7f9', padding: 20, boxSizing: 'border-box', color: dark ? '#e5e7eb' : 'inherit' };
    const container = { maxWidth: 960, margin: '0 auto' };
    const titleRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 };
    const captionStyle = { marginBottom: 14, color: dark ? '#9ca3af' : '#666', fontSize: 16 };
    const cardStyle = { background: dark ? '#0b1220' : '#fff', borderRadius: 8, padding: 16, border: `1px solid ${dark ? '#1f2937' : '#e5e7eb'}` };
    const sepBg = dark ? '#1f2937' : '#a2a2a2';

    const handleDeleteAccount = async () => {
        if (!token || !backendUrl) {
            if (onLogout) onLogout();
            return;
        }
        if (!window.confirm('确认删除账户吗？此操作不可恢复，所有个人数据可能被删除或无法恢复。')) return;
        setDeleting(true);
        try {
            const res = await fetch(`${backendUrl}/users/me`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                window.alert('账户已删除，正在退出登录');
                if (onLogout) await onLogout();
            } else {
                let data = null;
                try { data = await res.json(); } catch (e) { }
                const msg = data && data.error ? data.error : `删除失败（状态 ${res.status}）`;
                window.alert(msg);
                if (res.status === 401 && onLogout) onLogout();
            }
        } catch (e) {
            window.alert('删除请求失败：' + (e && e.message ? e.message : String(e)));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div style={rootStyle}>
            <div style={container}>
                <div style={titleRow}>
                    <h2 style={{ margin: 0 }}>用户设置</h2>
                </div>

                <div style={captionStyle}>
                    <span>设置</span> <span style={{ margin: '0 8px', color: dark ? '#6b7280' : '#9ca3af' }}>{'>'}</span>
                </div>

                <div style={cardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div><strong>当前用户名：</strong>{user ? user.username : '-'}</div>
                        <div>
                            <Tooltip text="修改用户名" placement="top">
                                <Button themeAware onClick={onOpenEditUsername} style={{ padding: '8px 12px', border: 0, alignItems: 'center', display: 'inline-flex', gap: 4, background: dark ? 'rgb(11,18,32)' : '#ffffff', color: dark ? '#fff' : undefined }}>
                                    <span className="material-symbols-outlined">chevron_right</span>
                                </Button>
                            </Tooltip>
                        </div>
                    </div>

                    <div style={{ paddingLeft: 10, paddingRight: 10, paddingBottom: 2, background: sepBg, margin: 0 }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 12 }}>
                        <div><strong>修改密码</strong></div>
                        <div>
                            <Tooltip text="修改密码" placement="top">
                                <Button themeAware onClick={onOpenEditPassword} style={{ padding: '8px 12px', border: 0, alignItems: 'center', display: 'inline-flex', gap: 4, background: dark ? 'rgb(11,18,32)' : '#ffffff', color: dark ? '#fff' : undefined }}>
                                    <span className="material-symbols-outlined">chevron_right</span>
                                </Button>
                            </Tooltip>
                        </div>
                    </div>

                    <div style={{ paddingLeft: 10, paddingRight: 10, paddingBottom: 2, background: sepBg, margin: 0 }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 12 }}>
                        <div><strong>个性化主题</strong></div>
                        <div>
                            <Tooltip text="个性化主题" placement="top">
                                <Button themeAware onClick={onOpenThemes} style={{ padding: '8px 12px', border: 0, alignItems: 'center', display: 'inline-flex', gap: 4, background: dark ? 'rgb(11,18,32)' : '#ffffff', color: dark ? '#fff' : undefined }}>
                                    <span className="material-symbols-outlined">chevron_right</span>
                                </Button>
                            </Tooltip>
                        </div>
                    </div>

                    <div style={{ paddingLeft: 10, paddingRight: 10, paddingBottom: 2, background: sepBg, margin: 0 }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 12 }}>
                        <div><strong>个性化地图</strong></div>
                        <div>
                            <Tooltip text="个性化地图" placement="top">
                                <Button themeAware onClick={onOpenPersonalize} style={{ padding: '8px 12px', border: 0, alignItems: 'center', display: 'inline-flex', gap: 4, background: dark ? 'rgb(11,18,32)' : '#ffffff', color: dark ? '#fff' : undefined }}>
                                    <span className="material-symbols-outlined">chevron_right</span>
                                </Button>
                            </Tooltip>
                        </div>
                    </div>
                    <div style={{ paddingLeft: 10, paddingRight: 10, paddingBottom: 2, background: sepBg, margin: '12px 0' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                        <div>
                            <div style={{ fontWeight: 600, color: dark ? '#fda4af' : '#b91c1c' }}>删除账户</div>
                            <div style={{ fontSize: 13, color: dark ? '#9ca3af' : '#666' }}>此操作不可恢复，会删除部分个人信息并取消账户访问权限。</div>
                        </div>
                        <div>
                            <Tooltip text="删除账户（不可恢复）" placement="top">
                                <Button themeAware onClick={handleDeleteAccount} style={{ padding: '8px 12px', border: 0, background: '#dc2626', color: '#fff' }} disabled={deleting}>
                                    {deleting ? '删除中...' : '删除账户'}
                                </Button>
                            </Tooltip>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
