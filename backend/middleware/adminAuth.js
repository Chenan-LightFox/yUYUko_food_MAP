const PERMISSIONS = require("../utils/adminPermissions");

function requireAdmin(permission) {
    return function (req, res, next) {
        const user = req.user; // 假设已解 token
        if (!user || !user.admin_level) return res.status(403).json({ error: "无管理员权限" });
        const allowed = PERMISSIONS[user.admin_level] || [];
        if (!allowed.includes(permission)) return res.status(403).json({ error: "无此操作权限" });
        next();
    };
}

module.exports = requireAdmin;