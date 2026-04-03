import React from 'react';

export default function Settings({ user, onBack }) {
    return (
        <div style={{ minHeight: "var(--app-height, 100vh)", background: "#f6f7f9", padding: 20, boxSizing: "border-box" }}>
            <div style={{ maxWidth: 960, margin: "0 auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h2 style={{ margin: 0 }}>用户设置</h2>
                </div>

                <div style={{ marginTop: 18 }}>
                    <p>欢迎，{user ? user.username : '用户'}。这里是你的设置页面。</p>
                    <p>目前此页面为占位，可在此处实现修改资料、修改密码等功能。</p>
                </div>

                <div style={{ background: "#fff", borderRadius: 8, padding: 16, border: "1px solid #e5e7eb" }}>
                    <div style={{ marginBottom: 8 }}><strong>当前用户：</strong>{user ? user.username : "-"}</div>
                </div>
            </div>
        </div>
    );
}
