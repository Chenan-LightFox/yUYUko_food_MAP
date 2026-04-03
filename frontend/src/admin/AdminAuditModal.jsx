import React, { useEffect, useState } from 'react';
import Button from '../components/Button';

export default function AdminAuditModal({ open, onClose, backendUrl, token }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const base = backendUrl || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000` : 'http://localhost:3000');

    useEffect(() => {
        if (!open) return;
        fetchLogs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const headers = token ? { Authorization: `Bearer ${token}` } : {};
            const res = await fetch(`${base}/admin/audit`, { headers });
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                throw new Error(`Fetch failed ${res.status} ${txt}`);
            }
            const data = await res.json().catch(() => []);
            setLogs(data || []);
        } catch (e) {
            console.error('fetchLogs failed', e);
            setLogs([]);
        } finally {
            setLoading(false);
        }
    };

    if (!open) return null;

    return (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 6000 }}>
            <div style={{ background: '#fff', padding: 12, borderRadius: 6, minWidth: 640, maxWidth: '95%', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>管理员操作日志（最近 200 条）</h3>
                    <div>
                        <Button onClick={onClose} style={{ border: 'none', background: 'transparent' }}>×</Button>
                    </div>
                </div>
                <div style={{ marginTop: 8 }}>
                    {loading ? (
                        <div>加载中…</div>
                    ) : (
                        <div>
                            {logs.length === 0 ? (
                                <div style={{ color: '#666' }}>暂无操作记录</div>
                            ) : (
                                <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>管理员ID</th>
                                            <th>动作</th>
                                            <th>目标用户</th>
                                            <th>详情</th>
                                            <th>时间</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map(l => (
                                            <tr key={l.id}>
                                                <td>{l.id}</td>
                                                <td>{l.admin_id}</td>
                                                <td>{l.action}</td>
                                                <td>{l.target_user_id || '-'}</td>
                                                <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.details || '-'}</td>
                                                <td>{l.time}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
