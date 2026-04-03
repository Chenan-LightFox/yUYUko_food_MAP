import React from 'react';

export default function Settings({ user, onBack }) {
    return (
        <div style={{ minHeight: 'var(--app-height, 100vh)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h2 style={{ margin: 0 }}>用户设置</h2>
            </div>

            <div style={{ marginTop: 18 }}>
                <p>欢迎，{user ? user.username : '用户'}。这里是你的设置页面。</p>
                <p>目前此页面为占位，可在此处实现修改资料、修改密码等功能。</p>
            </div>
        </div>
    );
}
