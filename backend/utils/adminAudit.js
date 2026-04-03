const { db } = require('../db');

function logAdminAction(admin_id, action, target_user_id = null, details = null) {
    try {
        db.run(
            `INSERT INTO AdminAudit (admin_id, action, target_user_id, details) VALUES (?, ?, ?, ?)`,
            [admin_id || null, action || null, target_user_id || null, details || null],
            (err) => {
                if (err) console.error('Failed to write admin audit log:', err.message);
            }
        );
    } catch (e) {
        console.error('Exception when writing admin audit log:', e && e.message);
    }
}

module.exports = {
    logAdminAction
};
