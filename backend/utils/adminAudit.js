const { db } = require('../db');
const logger = require('./logger');

function auditTrace(overrides = {}) {
    const context = logger.getContext();
    return {
        ip: overrides.ip || context.ip || null,
        requestId: overrides.requestId || overrides.request_id || context.requestId || null
    };
}

function insertAdminAction(admin_id, action, target_user_id = null, details = null, traceOverrides = {}) {
    const trace = auditTrace(traceOverrides);
    return db._raw.prepare(
        `INSERT INTO AdminAudit (admin_id, action, target_user_id, details, ip, request_id)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
        admin_id == null ? null : String(admin_id),
        action || null,
        target_user_id == null ? null : String(target_user_id),
        details || null,
        trace.ip,
        trace.requestId
    );
}

module.exports = {
    insertAdminAction
};
