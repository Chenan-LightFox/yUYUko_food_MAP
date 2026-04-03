import React, { useState } from "react";
import { useAuth } from "../AuthContext";
import useDarkMode from '../hooks/useDarkMode';

export default function BanNotice({ canClose = true }) {
    const { user } = useAuth();
    const [visible, setVisible] = useState(true);
    if (!visible) return null;
    if (!user || !user.is_banned) return null;
    const reason = user.ban_reason || '无';
    const expires = user.ban_expires ? (new Date(user.ban_expires)).toLocaleString() : '永久';

    // 封禁通知强制不可关闭
    const closable = Boolean(canClose) && !user.is_banned;

    const dark = useDarkMode();

    const style = {
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '55%',
        maxWidth: '960px',
        minWidth: '280px',
        zIndex: 9999,
        padding: '12px 16px',
        borderRadius: 8,
        background: dark ? '#3b0b0b' : '#fff6f6',
        border: dark ? '1px solid #6b1414' : '1px solid #ffd6d6',
        color: dark ? '#ffd6d6' : '#8b0000',
        textAlign: 'center',
        boxShadow: dark ? '0 2px 10px rgba(0,0,0,0.6)' : '0 2px 10px rgba(0,0,0,0.08)'
    };

    const closeBtnStyle = {
        position: 'absolute',
        top: 6,
        right: 8,
        border: 'none',
        background: 'transparent',
        color: dark ? '#ffd6d6' : '#8b0000',
        fontSize: 16,
        cursor: 'pointer',
        lineHeight: '1'
    };

    return (
        <div style={style}>
            {closable && (
                <button aria-label="关闭" style={closeBtnStyle} onClick={() => setVisible(false)}>×</button>
            )}
            <div style={{ fontWeight: 700 }}>账号已被封禁</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>原因：{reason}；到期：{expires}</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>被封禁的账号只能查看内容，无法进行发帖/修改等操作。</div>
        </div>
    );
}
