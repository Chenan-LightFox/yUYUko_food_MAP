import AdminUsers from './admin/AdminUsers';

const PERMISSIONS = {
    YUYUKO: ["用户管理", "普通用户管理", "标记点管理", "邀请码管理", "评论管理"],
    YOUMU: ["普通用户管理", "标记点管理", "邀请码管理", "评论管理"],
    KOMACHI: ["普通用户管理", "评论管理"],
};

export default function AdminDashboard({ user }) {
    const level = user.admin_level;
    const perms = PERMISSIONS[level] || [];

    // TODO: 挂载各等级管理面板路由

    return (
        <div>
            <h2>管理员后台</h2>
            <ul>
                {perms.includes("用户管理") && <li><a href="/admin/users">管理所有用户</a></li>}
                {perms.includes("普通用户管理") && <li><a href="/admin/general-users">管理一般用户</a></li>}
                {perms.includes("标记点管理") && <li><a href="/admin/places">管理地图标记点</a></li>}
                {perms.includes("邀请码管理") && <li><a href="/admin/invites">管理邀请码</a></li>}
                {perms.includes("评论管理") && <li><a href="/admin/comments">管理评论</a></li>}
            </ul>
        </div>
    );
}
