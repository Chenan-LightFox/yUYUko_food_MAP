import React, { useState, useEffect } from 'react';
import PageTemplate from '../components/PageTemplate';
import Button from '../components/Button';
import TextInput from '../components/TextInput';
import { useTips } from '../components/Tips';
import useDarkMode from '../utils/useDarkMode';

export default function EditUsername({ user, onBack, backendUrl, token, onUpdateUser }) {
    const [username, setUsername] = useState(user ? user.username : '');
    const [loading, setLoading] = useState(false);
    const showTip = useTips();
    const dark = useDarkMode();

    useEffect(() => {
        setUsername(user ? user.username : '');
    }, [user]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const newName = (username || '').trim();
        if (!newName) { showTip('用户名不能为空'); return; }
        if (!backendUrl || !token) { showTip('未提供后端地址或未登录'); return; }
        setLoading(true);
        try {
            const res = await fetch(`${backendUrl}/users/me`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ username: newName })
            });

            const text = await res.text();
            let data = null;
            try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }

            if (!res.ok) {
                const errMsg = (data && data.error) ? data.error : (text ? (text.trim().startsWith('<') ? `服务器返回错误（HTTP ${res.status}）` : text) : '更新失败');
                showTip(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
                setLoading(false);
                return;
            }

            // update app state with returned user and token
            if (onUpdateUser && data && data.user && data.token) {
                onUpdateUser(data.user, data.token);
            }
            showTip('用户名已更新');
            if (onBack) onBack();
        } catch (ex) {
            showTip(ex.message || '请求失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <PageTemplate
            breadcrumb={[{ label: '设置', onClick: onBack }, { label: '修改用户名' }]}
        >
            <form onSubmit={handleSubmit}>
                <label style={{ display: 'block', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: dark ? '#9ca3af' : '#666', marginBottom: 6 }}>用户名</div>
                    <TextInput
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        style={{ width: '100%' }}
                    />
                </label>



                <div style={{ display: 'flex', gap: 8 }}>
                    <Button themeAware type="submit" disabled={loading} style={{ padding: '8px 12px' }}>{loading ? '保存中...' : '保存'}</Button>
                    <Button themeAware type="button" onClick={() => { setUsername(user ? user.username : ''); if (onBack) onBack(); }} style={{ padding: '8px 12px' }}>取消</Button>
                </div>
            </form>
        </PageTemplate>
    );
}
