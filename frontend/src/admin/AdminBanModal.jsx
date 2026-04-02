import React, { useState, useEffect } from 'react';
import Button from '../components/Button';

export default function AdminBanModal({ open, onClose, onConfirm, targetUser }) {
    const [reason, setReason] = useState('');
    const [duration, setDuration] = useState('7'); // default 7 days

    useEffect(() => {
        if (open) {
            setReason('');
            setDuration('7');
        }
    }, [open, targetUser]);

    if (!open) return null;

    const handleConfirm = () => {
        let durationDays = null;
        if (duration === 'perm') durationDays = 0; // indicate permanent
        else durationDays = Number(duration) || null;
        onConfirm && onConfirm({ reason: reason.trim() || null, durationDays });
    };

    return (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 7000 }}>
            <div style={{ background: '#fff', padding: 12, borderRadius: 6, minWidth: 420, maxWidth: '95%', boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>封禁用户 {targetUser ? targetUser.username : ''}</h3>
                    <div>
                        <Button onClick={onClose} style={{ border: 'none', background: 'transparent' }}>×</Button>
                    </div>
                </div>

                <div style={{ marginTop: 8 }}>
                    <div style={{ marginBottom: 8 }}>
                        <label style={{ display: 'block', marginBottom: 6 }}>封禁时长</label>
                        <select value={duration} onChange={e => setDuration(e.target.value)} style={{ width: '100%', padding: 8 }}>
                            <option value="1">1 天</option>
                            <option value="7">7 天</option>
                            <option value="30">30 天</option>
                            <option value="perm">永久封禁</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: 6 }}>封禁原因（可选）</label>
                        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="请输入封禁原因" style={{ width: '96%', minHeight: 80, padding: 8 }} />
                    </div>

                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <Button onClick={onClose} style={{ background: '#fff', border: '1px solid #e5e7eb' }}>取消</Button>
                        <Button onClick={handleConfirm} style={{ background: '#a04400', color: '#fff' }}>确认封禁</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
