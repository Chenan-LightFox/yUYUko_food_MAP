import React, { useMemo } from "react";
import Button from "./components/Button";
import AdminPlaces from "./admin/AdminPlaces";
import AdminUsers from "./admin/AdminUsers";
import AdminInvitecode from "./admin/AdminInvitecodes";

const PERMISSIONS = {
    YUYUKO: ["用户管理", "普通用户管理", "标记点管理", "邀请码管理", "评论管理"],
    YOUMU: ["普通用户管理", "标记点管理", "邀请码管理", "评论管理"],
    KOMACHI: ["普通用户管理", "评论管理"]
};

export default function AdminDashboard({ user, token, backendUrl, onBackHome, onLogout, onRequireAuth }) {
    const level = user && user.admin_level ? user.admin_level : null;
    const perms = level ? (PERMISSIONS[level] || []) : [];

    const canManagePlaces = useMemo(() => !!(user && user.admin_level), [user]);
    const canManageUsers = useMemo(() => perms.includes("用户管理"), [perms]);
    const canManageInvites = useMemo(() => perms.includes("邀请码管理"), [perms]);

    return (
        <div style={{ minHeight: "var(--app-height, 100vh)", background: "#f6f7f9", padding: 20, boxSizing: "border-box" }}>
            <div style={{ maxWidth: 960, margin: "0 auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h2 style={{ margin: 0 }}>管理员后台</h2>
                    <div>
                        <Button onClick={onBackHome} style={{ marginRight: 8 }}>返回地图</Button>
                        <Button onClick={onLogout}>注销</Button>
                    </div>
                </div>

                <div style={{ background: "#fff", borderRadius: 8, padding: 16, border: "1px solid #e5e7eb" }}>
                    <div style={{ marginBottom: 8 }}><strong>当前用户：</strong>{user ? user.username : "-"}</div>
                    <div style={{ marginBottom: 10 }}><strong>管理员等级：</strong>{level || "普通用户"}</div>

                    {level ? (
                        <div>
                            <div style={{ marginBottom: 8 }}><strong>当前可见权限：</strong></div>
                            <ul style={{ margin: 0, paddingLeft: 22 }}>
                                {perms.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        <div style={{ color: "#b00020" }}>当前账号不是管理员，无法访问后台功能。</div>
                    )}
                </div>

                {/* Users management panel */}
                {canManageUsers && (
                    <div style={{ marginTop: 18, background: '#fff', padding: 12, borderRadius: 8 }}>
                        <AdminUsers backendUrl={backendUrl} token={token} user={user} onRequireAuth={onRequireAuth} />
                    </div>
                )}

                {/* Places management panel */}
                {canManagePlaces && (
                    <div style={{ marginTop: 18, background: '#fff', padding: 12, borderRadius: 8 }}>
                        <AdminPlaces backendUrl={backendUrl} token={token} user={user} onRequireAuth={onRequireAuth} />
                    </div>
                )}

                {/* Invite codes management panel */}
                {canManageInvites && (
                    <div style={{ marginTop: 18, background: '#fff', padding: 12, borderRadius: 8 }}>
                        <AdminInvitecode backendUrl={backendUrl} token={token} user={user} onRequireAuth={onRequireAuth} />
                    </div>
                )}
            </div>
        </div>
    );
}
