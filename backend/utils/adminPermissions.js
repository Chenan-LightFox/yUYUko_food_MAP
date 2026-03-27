const PERMISSIONS = {
    YUYUKO: ["manage_users", "manage_users_general", "manage_places", "manage_invites", "manage_comments"],
    YOUMU: ["manage_users_general", "manage_places", "manage_invites", "manage_comments"],
    KOMACHI: ["manage_users_general", "manage_comments"]
};

function getPermissionsForLevel(adminLevel) {
    if (!adminLevel) return [];
    return PERMISSIONS[adminLevel] || [];
}

function hasPermission(user, permission) {
    if (!user || !permission) return false;
    return getPermissionsForLevel(user.admin_level).includes(permission);
}

module.exports = {
    PERMISSIONS,
    getPermissionsForLevel,
    hasPermission
};
