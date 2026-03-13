const requireAdmin = require("../middleware/adminAuth");
// 用户管理：所有用户
app.get("/admin/users", requireAdmin("manage_users"), handler);
// 用户管理：普通用户
app.get("/admin/general-users", requireAdmin("manage_users_general"), handler);
// 地图标记点管理
app.get("/admin/places", requireAdmin("manage_places"), handler);
// 邀码管理
app.get("/admin/invites", requireAdmin("manage_invites"), handler);
// 评论管理
app.get("/admin/comments", requireAdmin("manage_comments"), handler);