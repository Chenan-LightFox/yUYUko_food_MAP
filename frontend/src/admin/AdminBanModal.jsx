import React, { useState, useEffect } from 'react';
import Button from '../components/Button';
import SelectInput from '../components/SelectInput';
import TextArea from '../components/TextArea';

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
            <div style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', padding: 12, borderRadius: 10, border: '1px solid var(--color-border)', minWidth: 420, maxWidth: '95%', boxShadow: 'var(--shadow-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>封禁用户 {targetUser ? targetUser.username : ''}</h3>
                    <div>
                        <Button themeAware onClick={onClose} style={{ border: 'none', background: 'transparent' }}>×</Button>
                    </div>
                </div>

                <div style={{ marginTop: 8 }}>
                    <div style={{ marginBottom: 8 }}>
                        <label style={{ display: 'block', marginBottom: 6, color: 'var(--color-text-secondary)' }}>封禁时长</label>
                        <SelectInput value={duration} onChange={e => setDuration(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 6 }}>
                            <option value="1">1 天</option>
                            <option value="7">7 天</option>
                            <option value="30">30 天</option>
                            <option value="perm">永久封禁</option>
                        </SelectInput>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: 6, color: 'var(--color-text-secondary)' }}>封禁原因（可选）</label>
                        <TextArea value={reason} onChange={e => setReason(e.target.value)} placeholder="请输入封禁原因" style={{ width: '96%', minHeight: 80, padding: 8 }} />
                    </div>

                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <Button themeAware onClick={onClose} style={{ background: 'var(--color-bg-overlay)', border: '1px solid var(--color-border)' }}>取消</Button>
                        <Button themeAware onClick={handleConfirm} style={{ background: 'var(--color-warning)', color: 'var(--color-on-emphasis)', borderColor: 'var(--color-warning)' }}>确认封禁</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
