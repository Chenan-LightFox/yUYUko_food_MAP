import React, { useState, useEffect } from 'react';
import PageTemplate from '../components/PageTemplate';
import Button from '../components/Button';

export default function EditUsername({ user, onBack, backendUrl, token, onUpdateUser }) {
    const [username, setUsername] = useState(user ? user.username : '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    useEffect(() => {
        setUsername(user ? user.username : '');
    }, [user]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        const newName = (username || '').trim();
        if (!newName) return setError('用户名不能为空');
        if (!backendUrl || !token) return setError('未提供后端地址或未登录');
        setLoading(true);
        try {
            const res = await fetch(`${backendUrl}/users/me`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ username: newName })
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data && data.error ? data.error : '更新失败');
                setLoading(false);
                return;
            }
            // update app state with returned user and token
            if (onUpdateUser && data && data.user && data.token) {
                onUpdateUser(data.user, data.token);
            }
            setSuccess('用户名已更新');
        } catch (ex) {
            setError(ex.message || '请求失败');
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
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>用户名</div>
                    <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', borderRadius: 4, border: '1px solid #d1d5db' }}
                    />
                </label>

                {error && <div style={{ color: '#b00020', marginBottom: 8 }}>{error}</div>}
                {success && <div style={{ color: '#0b8a0b', marginBottom: 8 }}>{success}</div>}

                <div style={{ display: 'flex', gap: 8 }}>
                    <Button type="submit" disabled={loading} style={{ padding: '8px 12px' }}>{loading ? '保存中...' : '保存'}</Button>
                    <Button type="button" onClick={() => { setUsername(user ? user.username : ''); setError(null); setSuccess(null); }} style={{ padding: '8px 12px' }}>重置</Button>
                </div>
            </form>
        </PageTemplate>
    );
}
