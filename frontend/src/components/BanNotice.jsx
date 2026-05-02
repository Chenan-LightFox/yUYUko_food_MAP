import React, { useState } from "react";
import { useAuth } from "../AuthContext";
import Notice from './Notice';

export default function BanNotice({ canClose = true, style }) {
    const { user } = useAuth();
    const [visible, setVisible] = useState(true);
    if (!visible) return null;
    if (!user || !user.is_banned) return null;
    const reason = user.ban_reason || '无';
    const expires = user.ban_expires ? (new Date(user.ban_expires)).toLocaleString() : '永久';

    // 封禁通知强制不可关闭
    const closable = Boolean(canClose) && !user.is_banned;

    return (
        <Notice
            title="账号已被封禁"
            tone="danger"
            canClose={closable}
            onClose={() => setVisible(false)}
            zIndex={9999}
            style={style}
        >
            <div style={{ fontSize: 13, marginTop: 6 }}>原因：{reason}；到期：{expires}</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>被封禁的账号只能查看内容，无法进行发帖/修改等操作。</div>
        </Notice>
    );
}
