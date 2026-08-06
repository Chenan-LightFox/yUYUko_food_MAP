import React, { useState } from 'react';
import Button from './components/Button';
import Tooltip from './components/Tooltip';
import defaultAvatar from './img/default.png';
import { TipsContext } from './components/Tips';
import { useConfirm } from './components/Confirm';

export default function Settings({ user, onBack, onOpenEditAvatar, onOpenEditUsername, onOpenEditPassword, onOpenPersonalize, onOpenThemes, backendUrl, token, onLogout }) {
    const [deleting, setDeleting] = useState(false);
    const { showTip } = React.useContext(TipsContext);
    const confirm = useConfirm();

    const rootStyle = { minHeight: 'var(--app-height, 100vh)', background: 'var(--color-bg-base)', padding: 20, boxSizing: 'border-box', color: 'var(--color-text-primary)' };
    const container = { maxWidth: 960, margin: '0 auto' };
    const titleRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 };
    const captionStyle = { marginBottom: 14, color: 'var(--color-text-secondary)', fontSize: 16 };
    const cardStyle = { background: 'var(--color-bg-surface)', borderRadius: 10, padding: 16, border: '1px solid var(--color-border)', boxShadow: '0 8px 24px var(--color-glow)' };
    const sepBg = 'var(--color-border)';

    const handleDeleteAccount = async () => {
        if (!token || !backendUrl) {
            if (onLogout) onLogout();
            return;
        }
        if (!(await confirm('确认删除账户吗？此操作不可恢复，所有个人数据可能被删除或无法恢复。'))) return;
        setDeleting(true);
        try {
            const res = await fetch(`${backendUrl}/users/me`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                showTip('账户已删除，正在退出登录');
                if (onLogout) await onLogout();
            } else {
                let data = null;
                try { data = await res.json(); } catch (e) { }
                const msg = data && data.error ? data.error : `删除失败（状态 ${res.status}）`;
                showTip(msg);
                if (res.status === 401 && onLogout) onLogout();
            }
        } catch (e) {
            showTip('删除请求失败：' + (e && e.message ? e.message : String(e)));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div style={rootStyle}>
            <div style={container}>
                <div style={{ ...titleRow, marginTop: 50 }}>
                    <h2 style={{ margin: 0 }}>用户设置</h2>
                </div>

                <div style={captionStyle}>
                    <span>设置</span> <span style={{ margin: '0 8px', color: 'var(--color-text-muted)' }}>{'>'}</span>
                </div>

                <div style={cardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <strong>头像：</strong>
                            {user && user.has_avatar ? (
                                <img src={`${backendUrl}/users/${user.id}/avatar?t=${Date.now()}`} alt="Avatar" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                                <img src={defaultAvatar} alt="Default Avatar" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                            )}
                        </div>
                        <div>
                            <Tooltip text="修改头像" placement="top">
                                <Button themeAware onClick={onOpenEditAvatar} style={{ padding: '8px 12px', border: 0, alignItems: 'center', display: 'inline-flex', gap: 4, background: 'var(--color-bg-overlay)', color: 'var(--color-text-primary)' }}>
                                    <span className="material-symbols-outlined">chevron_right</span>
                                </Button>
                            </Tooltip>
                        </div>
                    </div>

                    <div style={{ paddingLeft: 10, paddingRight: 10, paddingBottom: 2, background: sepBg, margin: 0 }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 12 }}>
                        <div><strong>当前用户名：</strong>{user ? user.username : '-'}</div>
                        <div>
                            <Tooltip text="修改用户名" placement="top">
                                <Button themeAware onClick={onOpenEditUsername} style={{ padding: '8px 12px', border: 0, alignItems: 'center', display: 'inline-flex', gap: 4, background: 'var(--color-bg-overlay)', color: 'var(--color-text-primary)' }}>
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
                                <Button themeAware onClick={onOpenEditPassword} style={{ padding: '8px 12px', border: 0, alignItems: 'center', display: 'inline-flex', gap: 4, background: 'var(--color-bg-overlay)', color: 'var(--color-text-primary)' }}>
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
                                <Button themeAware onClick={onOpenThemes} style={{ padding: '8px 12px', border: 0, alignItems: 'center', display: 'inline-flex', gap: 4, background: 'var(--color-bg-overlay)', color: 'var(--color-text-primary)' }}>
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
                                <Button themeAware onClick={onOpenPersonalize} style={{ padding: '8px 12px', border: 0, alignItems: 'center', display: 'inline-flex', gap: 4, background: 'var(--color-bg-overlay)', color: 'var(--color-text-primary)' }}>
                                    <span className="material-symbols-outlined">chevron_right</span>
                                </Button>
                            </Tooltip>
                        </div>
                    </div>
                    <div style={{ paddingLeft: 10, paddingRight: 10, paddingBottom: 2, background: sepBg, margin: '12px 0' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                        <div>
                            <div style={{ fontWeight: 600, color: 'var(--color-danger)' }}>删除账户</div>
                            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>此操作不可恢复，会删除部分个人信息并取消账户访问权限。</div>
                        </div>
                        <div>
                            <Tooltip text="删除账户（不可恢复）" placement="top">
                                <Button themeAware onClick={handleDeleteAccount} style={{ padding: '8px 12px', border: 0, background: 'var(--color-danger)', color: 'var(--color-on-emphasis)' }} disabled={deleting}>
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
