import React, { useEffect, useState } from 'react';
import Button from '../components/Button';
import useDarkMode from '../utils/useDarkMode';
import ResponsiveTable from '../components/ResponsiveTable';
import ScrollableView from '../components/ScrollableView';
import { getThemeColor } from '../utils/theme';
import JsonTable from '../components/JsonTable';

export default function AdminAuditModal({ open, onClose, backendUrl, token }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const base = backendUrl || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:2053` : 'http://localhost:2053');

    const dark = useDarkMode();
    const themeColor = getThemeColor();

    const hexToRgba = (hex, a = 1) => {
        try {
            let h = (hex || '').replace('#', '');
            if (h.length === 3) h = h.split('').map(c => c + c).join('');
            const bigint = parseInt(h, 16);
            const r = (bigint >> 16) & 255;
            const g = (bigint >> 8) & 255;
            const b = bigint & 255;
            return `rgba(${r},${g},${b},${a})`;
        } catch (e) {
            return `rgba(0,0,0,${a})`;
        }
    };

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
            <ScrollableView style={{
                background: dark ? '#0b1220' : '#fff',
                padding: 12,
                boxSizing: 'border-box',
                borderRadius: 6,
                width: 'min(640px, calc(100vw - 24px))',
                minWidth: 0,
                maxWidth: 'calc(100vw - 24px)',
                maxHeight: '80vh',
                overflowY: 'auto',
                boxShadow: dark ? '0 6px 24px rgba(0,0,0,0.6)' : '0 8px 40px rgba(0,0,0,0.25)',
                color: dark ? '#e5e7eb' : undefined
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>管理员操作日志（最近 200 条）</h3>
                    <div>
                        <Button themeAware onClick={onClose} style={{ border: 'none', background: 'transparent' }}>×</Button>
                    </div>
                </div>
                <div style={{ marginTop: 8 }}>
                    {loading ? (
                        <div>加载中…</div>
                    ) : (
                        <div>
                            {logs.length === 0 ? (
                                <div style={{ color: dark ? '#9ca3af' : '#666' }}>暂无操作记录</div>
                            ) : (
                                <ResponsiveTable minWidth={900} cellPadding="8" style={{ border: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #ddd' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'left', padding: 8, minWidth: 80 }}>ID</th>
                                            <th style={{ textAlign: 'left', padding: 8, minWidth: 80 }}>管理员ID</th>
                                            <th style={{ textAlign: 'left', padding: 8 }}>动作</th>
                                            <th style={{ textAlign: 'left', padding: 8, minWidth: 80 }}>目标用户</th>
                                            <th style={{ textAlign: 'left', padding: 8 }}>详情</th>
                                            <th style={{ textAlign: 'left', padding: 8, minWidth: 100 }}>时间</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((l, idx) => (
                                            <tr key={l.id} style={{ borderTop: dark ? '1px solid rgba(255,255,255,0.04)' : undefined, background: idx % 2 === 0 ? (dark ? 'rgba(255,255,255,0.02)' : '#fafafa') : undefined }}>
                                                <td style={{ padding: 8, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.id}>{l.id}</td>
                                                <td style={{ padding: 8, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.admin_id}>{l.admin_id}</td>
                                                <td style={{ padding: 8 }}>{l.action}</td>
                                                <td style={{ padding: 8 }}>{l.target_user_id || '-'}</td>
                                                <td style={{ padding: 8, maxWidth: 320, verticalAlign: 'top' }}>
                                                    {l.details ? (
                                                        <div style={{ maxWidth: 320 }}>
                                                            <JsonTable value={l.details} />
                                                        </div>
                                                    ) : '-'}
                                                </td>
                                                <td style={{ padding: 8 }}>{l.time}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </ResponsiveTable>
                            )}
                        </div>
                    )}
                </div>
            </ScrollableView>
        </div>
    );
}
