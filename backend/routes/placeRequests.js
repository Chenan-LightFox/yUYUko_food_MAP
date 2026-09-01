const express = require("express");
const router = express.Router();
const { db } = require("../db");
const { requireAuth } = require("../middleware/auth");
const requireAdmin = require("../middleware/adminAuth");
const { insertAdminAction } = require("../utils/adminAudit");
const { queuePlaceVectorSync } = require('../services/placeVectorService');
const { normalizeImageUrls } = require('../utils/imageUrls');
const { createPlaceRequest } = require('../services/placeRequestService');

// 提交地点修改申请（需登录）
router.post("/", requireAuth, (req, res) => {
    const { place_id, proposed, note } = req.body;
    const requester_id = req.user && req.user.id;
    if (!place_id || !proposed || typeof proposed !== "object") return res.status(400).json({ error: "缺少参数或 proposed 格式错误" });

    try {
        const row = createPlaceRequest({ placeId: place_id, requesterId: requester_id, proposed, note });
        return res.status(201).json(row);
    } catch (error) {
        if (error && error.publicMessage) {
            return res.status(error.status || 400).json({ error: error.publicMessage, code: error.code });
        }
        res.locals.unhandledError = error;
        return res.status(500).json({ error: '修改申请提交失败，请稍后重试' });
    }
});

function reviewFailure(status, code, message) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    error.publicMessage = message;
    return error;
}

const reviewPlaceRequestTransaction = db._raw.transaction(({ id, action, adminId }) => {
    const reqRow = db._raw.prepare('SELECT * FROM PlaceRequest WHERE id = ?').get(id);
    if (!reqRow) throw reviewFailure(404, 'PLACE_REQUEST_NOT_FOUND', '申请不存在');
    if (reqRow.status !== 'pending') {
        throw reviewFailure(409, 'PLACE_REQUEST_ALREADY_REVIEWED', '此申请已被处理');
    }

    if (action === 'reject') {
        const reviewed = db._raw.prepare(
            `UPDATE PlaceRequest
             SET status = 'rejected', reviewed_by = ?, reviewed_time = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'pending'`
        ).run(adminId, id);
        if (reviewed.changes !== 1) {
            throw reviewFailure(409, 'PLACE_REQUEST_ALREADY_REVIEWED', '此申请已被处理');
        }
        insertAdminAction(
            adminId,
            'place-request-review',
            reqRow.requester_id || null,
            JSON.stringify({ request_id: id, action: 'reject' })
        );
        return { action, placeId: reqRow.place_id, semanticChanged: false };
    }

    let proposed;
    try {
        proposed = JSON.parse(reqRow.proposed);
    } catch (error) {
        throw reviewFailure(400, 'INVALID_PLACE_REQUEST_PAYLOAD', '提议内容解析失败');
    }
    if (!proposed || typeof proposed !== 'object' || Array.isArray(proposed)) {
        throw reviewFailure(400, 'INVALID_PLACE_REQUEST_PAYLOAD', '提议内容解析失败');
    }

    const keys = Object.keys(proposed).filter((key) => [
        'name', 'description', 'latitude', 'longitude', 'category',
        'exterior_images', 'menu_images', 'per_person_cost', 'creator_id',
        'updated_time', 'updated_by'
    ].includes(key));
    if (!keys.length) throw reviewFailure(400, 'EMPTY_PLACE_REQUEST', '无可应用的变更');

    const semanticChanged = keys.some((key) => ['name', 'description', 'category', 'per_person_cost'].includes(key));
    const sets = [
        ...keys.map((key) => `${key} = ?`),
        ...(semanticChanged ? ['has_vector = 0'] : [])
    ].join(', ');
    const values = keys.map((key) => {
        if (['exterior_images', 'menu_images'].includes(key)) {
            return proposed[key] ? JSON.stringify(normalizeImageUrls(proposed[key])) : null;
        }
        return proposed[key];
    });
    const placeUpdate = db._raw.prepare(`UPDATE Place SET ${sets} WHERE id = ?`)
        .run(...values, reqRow.place_id);
    if (placeUpdate.changes !== 1) {
        throw reviewFailure(409, 'PLACE_REQUEST_TARGET_MISSING', '申请对应的地点已不存在');
    }

    const reviewed = db._raw.prepare(
        `UPDATE PlaceRequest
         SET status = 'approved', reviewed_by = ?, reviewed_time = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending'`
    ).run(adminId, id);
    if (reviewed.changes !== 1) {
        throw reviewFailure(409, 'PLACE_REQUEST_ALREADY_REVIEWED', '此申请已被处理');
    }
    insertAdminAction(
        adminId,
        'place-request-review',
        reqRow.requester_id || null,
        JSON.stringify({ request_id: id, action: 'approve', applied: keys })
    );
    return { action, placeId: reqRow.place_id, semanticChanged };
});

// 管理员获取所有申请（需 manage_places 权限）
router.get("/", requireAuth, requireAdmin("manage_places"), (req, res) => {
    db.all("SELECT * FROM PlaceRequest ORDER BY created_time DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // 解析 proposed 字段
        const parsed = rows.map(r => ({ ...r, proposed: tryParseJSON(r.proposed) }));
        res.json(parsed);
    });
});

// 管理员审核（批准或驳回）
router.post("/:id/review", requireAuth, requireAdmin("manage_places"), (req, res) => {
    const id = req.params.id;
    const { action } = req.body; // approve / reject
    const adminId = req.user && req.user.id;
    if (!id || !action) return res.status(400).json({ error: "缺少参数" });
    if (!["approve", "reject"].includes(action)) return res.status(400).json({ error: "无效的 action" });

    let result;
    try {
        result = reviewPlaceRequestTransaction.immediate({ id, action, adminId });
    } catch (error) {
        if (error && error.publicMessage) {
            return res.status(error.status || 400).json({ error: error.publicMessage, code: error.code });
        }
        res.locals.unhandledError = error;
        return res.status(500).json({ error: '审批失败，请稍后重试' });
    }

    res.json({ success: true });
    if (result.semanticChanged) setImmediate(() => queuePlaceVectorSync(result.placeId));
});

function tryParseJSON(v) {
    try { return JSON.parse(v); } catch (e) { return v; }
}

module.exports = router;
