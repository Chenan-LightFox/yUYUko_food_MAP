import React, { useState } from 'react';
import PageTemplate from '../components/PageTemplate';
import Button from '../components/Button';
import TextInput from '../components/TextInput';
import { useTips } from '../components/Tips';
import useDarkMode from '../hooks/useDarkMode';

export default function EditPassword({ user, onBack, backendUrl, token, onUpdateUser }) {
    const [currentPwd, setCurrentPwd] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [loading, setLoading] = useState(false);
    const showTip = useTips();
    const dark = useDarkMode();

    const handleSubmit = async (e) => {
        e.preventDefault();
        const textCurrent = (currentPwd || '').trim();
        if (!backendUrl || !token) { showTip('未提供后端地址或未登录'); return; }
        if (!textCurrent) { showTip('请输入当前密码'); return; }
        if (!newPwd || newPwd.length < 6) { showTip('新密码长度至少 6 位'); return; }
        if (newPwd !== confirmPwd) { showTip('两次输入的新密码不一致'); return; }

        setLoading(true);
        try {
            const res = await fetch(`${backendUrl}/users/me/password`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd })
            });

            // 一律先读取为文本，再尝试解析为 JSON，避免后端返回 HTML 导致 res.json() 抛错
            const text = await res.text();
            let data = null;
            try {
                data = text ? JSON.parse(text) : null;
            } catch (e) {
                data = null;
            }

            if (!res.ok) {
                // 如果返回的是 HTML（例如 dev server 的 index.html），不要直接显示完整 HTML，改成友好提示
                let errMsg = (data && data.error) ? data.error : (text ? (text.trim().startsWith('<') ? `服务器返回错误（HTTP ${res.status}）` : text) : '修改密码失败');
                showTip(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
                setLoading(false);
                return;
            }

            if (onUpdateUser && data && data.user && data.token) {
                onUpdateUser(data.user, data.token);
            }

            // 清理表单并返回上一级，随后显示 Tips 提示
            setCurrentPwd('');
            setNewPwd('');
            setConfirmPwd('');
            if (typeof onBack === 'function') onBack();
            try {
                // 小延迟以确保路由切换完成后再显示提示（保证可见）
                if (typeof showTip === 'function') setTimeout(() => showTip('密码修改成功'), 120);
            } catch (e) {
                // ignore
            }
        } catch (ex) {
            showTip(ex.message || '请求失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <PageTemplate breadcrumb={[{ label: '设置', onClick: onBack }, { label: '修改密码' }]}>
            <form onSubmit={handleSubmit}>
                <label style={{ display: 'block', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: dark ? '#9ca3af' : '#666', marginBottom: 6 }}>当前密码</div>
                    <TextInput type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} style={{ width: '100%' }} />
                </label>

                <label style={{ display: 'block', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: dark ? '#9ca3af' : '#666', marginBottom: 6 }}>新密码</div>
                    <TextInput type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} style={{ width: '100%' }} />
                </label>

                <label style={{ display: 'block', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: dark ? '#9ca3af' : '#666', marginBottom: 6 }}>确认新密码</div>
                    <TextInput type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} style={{ width: '100%' }} />
                </label>



                <div style={{ display: 'flex', gap: 8 }}>
                    <Button themeAware type="submit" disabled={loading} style={{ padding: '8px 12px' }}>{loading ? '保存中...' : '保存'}</Button>
                    <Button themeAware type="button" onClick={() => { setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); }} style={{ padding: '8px 12px' }}>取消</Button>
                </div>
            </form>
        </PageTemplate>
    );
}
