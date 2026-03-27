const { hasPermission } = require("../utils/adminPermissions");

function requireAdmin(permission) {
    return function (req, res, next) {
        const user = req.user;
        if (!user) return res.status(401).json({ error: "未登录或授权已失效" });
        if (!user.admin_level) return res.status(403).json({ error: "无管理员权限" });
        if (!hasPermission(user, permission)) return res.status(403).json({ error: "无此操作权限" });
        next();
    };
}

module.exports = requireAdmin;
