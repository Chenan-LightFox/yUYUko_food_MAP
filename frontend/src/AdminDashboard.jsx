import React, { useMemo, useState } from "react";
import Button from "./components/Button";
import useDarkMode from './utils/useDarkMode';
import AdminPlaces from "./admin/AdminPlaces";
import AdminUsers from "./admin/AdminUsers";
import AdminInvitecode from "./admin/AdminInvitecodes";
import AdminComments from "./admin/AdminComments";
import AdminGeneralUsers from "./admin/AdminGeneralUsers";
import AdminAuditModal from "./admin/AdminAuditModal";

const PERMISSIONS = {
    YUYUKO: ["用户管理", "操作日志", "标记点管理", "邀请码管理", "评论管理"],
    YOUMU: ["普通用户管理", "标记点管理", "邀请码管理", "评论管理"],
    KOMACHI: ["普通用户管理", "评论管理"]
};

export default function AdminDashboard({ user, token, backendUrl, onBackHome, onLogout, onRequireAuth }) {
    const level = user && user.admin_level ? user.admin_level : null;
    const perms = level ? (PERMISSIONS[level] || []) : [];
    const [auditOpen, setAuditOpen] = useState(false);

    const canManagePlaces = useMemo(() => perms.includes("标记点管理"), [perms]);
    const canManageUsers = useMemo(() => perms.includes("用户管理"), [perms]);
    const canManageInvites = useMemo(() => perms.includes("邀请码管理"), [perms]);
    const canManageComments = useMemo(() => perms.includes("评论管理"), [perms]);
    const canManageGeneralUsers = useMemo(() => perms.includes("普通用户管理"), [perms]);
    const canViewAudit = useMemo(() => perms.includes("操作日志"), [perms]);

    const dark = useDarkMode();

    const rootStyle = { minHeight: "var(--app-height, 100vh)", background: dark ? '#0f1724' : '#f6f7f9', padding: 20, boxSizing: "border-box", color: dark ? '#e5e7eb' : 'inherit' };
    const containerStyle = { maxWidth: 960, margin: "0 auto" };
    const headerRow = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 };
    const cardStyle = { background: dark ? '#0b1220' : '#fff', borderRadius: 8, padding: 16, border: `1px solid ${dark ? '#1f2937' : '#e5e7eb'}` };
    const panelStyle = { marginTop: 18, background: dark ? '#0b1220' : '#fff', padding: 12, borderRadius: 8, border: `1px solid ${dark ? '#1f2937' : 'transparent'}` };

    return (
        <div style={rootStyle}>
            <div style={containerStyle}>
                <div style={headerRow}>
                    <h2 style={{ margin: 0 }}>管理员后台</h2>
                </div>

                <div style={cardStyle}>
                    <div style={{ marginBottom: 8 }}><strong>当前用户：</strong>{user ? user.username : "-"}</div>
                    <div style={{ marginBottom: 10 }}><strong>管理员等级：</strong>{level || "普通用户"}</div>

                    {level ? (
                        <div>
                            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div><strong>当前可见权限：</strong></div>
                                {canViewAudit && (
                                    <Button themeAware onClick={() => setAuditOpen(true)} style={{ marginLeft: 12 }}>查看操作日志</Button>
                                )}
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 22 }}>
                                {perms.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        <div style={{ color: dark ? '#ffb4b4' : '#b00020' }}>当前账号不是管理员，无法访问后台功能。</div>
                    )}
                </div>

                {/* 用户管理面板 */}
                {canManageUsers && (
                    <div style={panelStyle}>
                        <AdminUsers backendUrl={backendUrl} token={token} user={user} onRequireAuth={onRequireAuth} />
                    </div>
                )}

                {/* 普通用户管理面板 */}
                {canManageGeneralUsers && (
                    <div style={panelStyle}>
                        <AdminGeneralUsers backendUrl={backendUrl} token={token} user={user} onRequireAuth={onRequireAuth} />
                    </div>
                )}

                {/* 标记点管理面板 */}
                {canManagePlaces && (
                    <div style={panelStyle}>
                        <AdminPlaces backendUrl={backendUrl} token={token} user={user} onRequireAuth={onRequireAuth} />
                    </div>
                )}

                {/* 邀请码管理面板 */}
                {canManageInvites && (
                    <div style={panelStyle}>
                        <AdminInvitecode backendUrl={backendUrl} token={token} user={user} onRequireAuth={onRequireAuth} />
                    </div>
                )}

                {/* 评论管理面板 */}
                {canManageComments && (
                    <div style={panelStyle}>
                        <AdminComments backendUrl={backendUrl} token={token} user={user} onRequireAuth={onRequireAuth} />
                    </div>
                )}
            </div>
            <AdminAuditModal open={auditOpen} onClose={() => setAuditOpen(false)} backendUrl={backendUrl} token={token} />
        </div>
    );
}
