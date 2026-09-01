const express = require("express");
const router = express.Router();
const { db } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { hasPermission } = require("../utils/adminPermissions");
const { queuePlaceVectorSync, deletePlaceVector } = require('../services/placeVectorService');
const { normalizeImageUrls } = require('../utils/imageUrls');
const { createPlaceRequest } = require('../services/placeRequestService');

const PLACE_NAME_MAX_LENGTH = 120;
const PLACE_CATEGORY_MAX_LENGTH = 240;
const PLACE_DESCRIPTION_MAX_LENGTH = 1000;
const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/i;

function parseCategoryNames(value) {
    return String(value || '')
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item, index, items) => items.indexOf(item) === index);
}

function getCategoryNameLength(value) {
    return Array.from(value).reduce((length, character) => (
        length + (character.codePointAt(0) > 0x7f ? 2 : 1)
    ), 0);
}

function normalizeCategoryList(value) {
    const names = parseCategoryNames(value);
    const invalidName = names.find((name) => /[,，]/.test(name) || HTML_TAG_PATTERN.test(name) || getCategoryNameLength(name) > 16);
    if (invalidName) {
        return { error: `分类“${invalidName}”不能超过8个汉字或16个英文字符，且仅支持纯文本` };
    }
    return { value: names.join(', '), names };
}

function syncCategoryRegistry(names, creatorId) {
    if (!Array.isArray(names) || names.length === 0) return;
    const insert = db._raw.prepare(
        `INSERT OR IGNORE INTO Category (name, is_common, sort_order, created_by)
         VALUES (?, 0, 1000, ?)`
    );
    db._raw.transaction((items) => {
        items.forEach((name) => insert.run(name, creatorId || null));
    })(names);
}

function normalizePlainTextField(value, {
    fieldLabel,
    maxLength,
    required = false
}) {
    if (value == null || value === "") {
        if (required) {
            return { error: `${fieldLabel}不能为空` };
        }
        return { value: "" };
    }

    if (typeof value !== "string") {
        return { error: `${fieldLabel}必须是字符串` };
    }

    const normalized = value.trim();
    if (required && !normalized) {
        return { error: `${fieldLabel}不能为空` };
    }
    if (normalized.length > maxLength) {
        return { error: `${fieldLabel}不能超过 ${maxLength} 个字符` };
    }
    if (HTML_TAG_PATTERN.test(normalized)) {
        return { error: `${fieldLabel}仅支持纯文本` };
    }
    return { value: normalized };
}

function normalizeCoordinate(value, {
    fieldLabel,
    min,
    max
}) {
    const numericValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numericValue)) {
        return { error: `${fieldLabel}必须是有效数字` };
    }
    if (numericValue < min || numericValue > max) {
        return { error: `${fieldLabel}超出有效范围` };
    }
    return { value: numericValue };
}

// 列出所有地点（附带创建者和最后修改者姓名）
router.get("/", (req, res) => {
    const sql = `SELECT p.*, u.username AS creator_name, uu.username AS updated_by_name
                 FROM Place p
                 LEFT JOIN User u ON p.creator_id = u.id
                 LEFT JOIN User uu ON p.updated_by = uu.id
                 ORDER BY p.created_time DESC`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 按 bounds 查询范围内地点（附带创建者和最后修改者姓名）
router.get("/nearby", (req, res) => {
    const { minLng, minLat, maxLng, maxLat } = req.query;
    if (![minLng, minLat, maxLng, maxLat].every(Boolean)) return res.status(400).json({ error: "缺少范围参数" });
    const sql = `SELECT p.*, u.username AS creator_name, uu.username AS updated_by_name
                 FROM Place p
                 LEFT JOIN User u ON p.creator_id = u.id
                 LEFT JOIN User uu ON p.updated_by = uu.id
                 WHERE p.longitude BETWEEN ? AND ? AND p.latitude BETWEEN ? AND ?`;
    db.all(sql, [minLng, maxLng, minLat, maxLat], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 获取单个地点
router.get("/:id", (req, res) => {
    const sql = `SELECT p.*, u.username AS creator_name, uu.username AS updated_by_name
                 FROM Place p
                 LEFT JOIN User u ON p.creator_id = u.id
                 LEFT JOIN User uu ON p.updated_by = uu.id
                 WHERE p.id = ?`;
    db.get(sql, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "地点不存在" });
        res.json(row);
    });
});

// 添加地点
router.post("/", requireAuth, (req, res) => {
    const { name, description, latitude, longitude, category, exterior_images, menu_images, per_person_cost } = req.body;
    const creatorId = req.user.id;

    // 验证人均价格：可选，但若提供则需为正整数
    const normalizedPerPersonCost = (() => {
        if (per_person_cost == null || per_person_cost === '' || per_person_cost === undefined) return null;
        const n = parseInt(per_person_cost, 10);
        if (!Number.isInteger(n) || n <= 0) {
            return { error: "人均价格需为正整数" };
        }
        return { value: n };
    })();
    if (normalizedPerPersonCost && normalizedPerPersonCost.error) {
        return res.status(400).json({ error: normalizedPerPersonCost.error });
    }

    const normalizedName = normalizePlainTextField(name, {
        fieldLabel: "名称",
        maxLength: PLACE_NAME_MAX_LENGTH,
        required: true
    });
    if (normalizedName.error) return res.status(400).json({ error: normalizedName.error });

    const normalizedCategory = normalizePlainTextField(category, {
        fieldLabel: "分类",
        maxLength: PLACE_CATEGORY_MAX_LENGTH
    });
    if (normalizedCategory.error) return res.status(400).json({ error: normalizedCategory.error });
    const normalizedCategoryList = normalizeCategoryList(normalizedCategory.value);
    if (normalizedCategoryList.error) return res.status(400).json({ error: normalizedCategoryList.error });

    const normalizedDescription = normalizePlainTextField(description, {
        fieldLabel: "描述",
        maxLength: PLACE_DESCRIPTION_MAX_LENGTH
    });
    if (normalizedDescription.error) return res.status(400).json({ error: normalizedDescription.error });

    const normalizedLatitude = normalizeCoordinate(latitude, {
        fieldLabel: "纬度",
        min: -90,
        max: 90
    });
    if (normalizedLatitude.error) return res.status(400).json({ error: normalizedLatitude.error });

    const normalizedLongitude = normalizeCoordinate(longitude, {
        fieldLabel: "经度",
        min: -180,
        max: 180
    });
    if (normalizedLongitude.error) return res.status(400).json({ error: normalizedLongitude.error });

    try {
        syncCategoryRegistry(normalizedCategoryList.names, creatorId);
    } catch (categoryError) {
        return res.status(500).json({ error: `分类目录同步失败：${categoryError.message}` });
    }

    // 将创建者同时设置为首次修改者（updated_by），并记录 updated_time
    const sql = `INSERT INTO Place (name, description, latitude, longitude, category, exterior_images, menu_images, per_person_cost, creator_id, updated_time, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`;
    db.run(sql, [
        normalizedName.value,
        normalizedDescription.value,
        normalizedLatitude.value,
        normalizedLongitude.value,
        normalizedCategoryList.value,
        exterior_images ? JSON.stringify(normalizeImageUrls(exterior_images)) : null,
        menu_images ? JSON.stringify(normalizeImageUrls(menu_images)) : null,
        normalizedPerPersonCost ? normalizedPerPersonCost.value : null,
        creatorId,
        creatorId
    ], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const sel = `SELECT p.*, u.username AS creator_name, uu.username AS updated_by_name
                     FROM Place p
                     LEFT JOIN User u ON p.creator_id = u.id
                     LEFT JOIN User uu ON p.updated_by = uu.id
                     WHERE p.id = ?`;
        db.get(sel, [this.lastID], (e, row) => {
            if (e) return res.status(500).json({ error: e.message });
            res.json(row);
            setImmediate(() => queuePlaceVectorSync(row.id));
        });
    });
});

// 在 places 路由下兼容的：为 place 提交修改申请（兼容前端或旧接口 POST /places/:id/requests）
router.post("/:id/requests", requireAuth, (req, res) => {
    const place_id = req.params.id;
    const { proposed, note } = req.body;
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

// 更新地点（创建者或管理员）
router.put("/:id", requireAuth, (req, res) => {
    const id = req.params.id;
    const { name, description, category, latitude, longitude, exterior_images, menu_images, per_person_cost } = req.body;
    const selPlaceSql = `SELECT p.*, u.username AS creator_name, uu.username AS updated_by_name
                        FROM Place p
                        LEFT JOIN User u ON p.creator_id = u.id
                        LEFT JOIN User uu ON p.updated_by = uu.id
                        WHERE p.id = ?`;
    db.get(selPlaceSql, [id], (err, place) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!place) return res.status(404).json({ error: "地点不存在" });
        const isCreator = String(place.creator_id) === String(req.user.id);
        const canManagePlaces = hasPermission(req.user, "manage_places");
        if (!isCreator && !canManagePlaces) return res.status(403).json({ error: "没有权限编辑" });

        const fields = [];
        const values = [];
        if (name != null) { fields.push("name = ?"); values.push(name); }
        if (description != null) { fields.push("description = ?"); values.push(description); }
        let normalizedCategoryNames = null;
        if (category != null) {
            const normalizedCategory = normalizePlainTextField(category, {
                fieldLabel: "分类",
                maxLength: PLACE_CATEGORY_MAX_LENGTH
            });
            if (normalizedCategory.error) return res.status(400).json({ error: normalizedCategory.error });
            const normalizedCategoryList = normalizeCategoryList(normalizedCategory.value);
            if (normalizedCategoryList.error) return res.status(400).json({ error: normalizedCategoryList.error });
            normalizedCategoryNames = normalizedCategoryList.names;
            fields.push("category = ?");
            values.push(normalizedCategoryList.value);
        }
        if (latitude != null) { fields.push("latitude = ?"); values.push(latitude); }
        if (longitude != null) { fields.push("longitude = ?"); values.push(longitude); }
        if (exterior_images !== undefined) { fields.push("exterior_images = ?"); values.push(exterior_images ? JSON.stringify(normalizeImageUrls(exterior_images)) : null); }
        if (menu_images !== undefined) { fields.push("menu_images = ?"); values.push(menu_images ? JSON.stringify(normalizeImageUrls(menu_images)) : null); }
        if (per_person_cost !== undefined) {
            if (per_person_cost === null || per_person_cost === '') {
                fields.push("per_person_cost = ?"); values.push(null);
            } else {
                const n = parseInt(per_person_cost, 10);
                if (!Number.isInteger(n) || n <= 0) return res.status(400).json({ error: "人均价格需为正整数" });
                fields.push("per_person_cost = ?"); values.push(n);
            }
        }
        const semanticChanged = [name, description, category, per_person_cost]
            .some((value) => value !== undefined);
        if (semanticChanged) fields.push('has_vector = 0');
        if (fields.length === 0) return res.status(400).json({ error: "没有提供要更新的字段" });

        // 更新 updated_time 和 updated_by
        const sql = `UPDATE Place SET ${fields.join(', ')}, updated_time = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?`;
        values.push(req.user.id);
        values.push(id);
        try {
            syncCategoryRegistry(normalizedCategoryNames, req.user.id);
        } catch (categoryError) {
            return res.status(500).json({ error: `分类目录同步失败：${categoryError.message}` });
        }
        db.run(sql, values, function (e) {
            if (e) return res.status(500).json({ error: e.message });
            const sel = `SELECT p.*, u.username AS creator_name, uu.username AS updated_by_name
                         FROM Place p
                         LEFT JOIN User u ON p.creator_id = u.id
                         LEFT JOIN User uu ON p.updated_by = uu.id
                         WHERE p.id = ?`;
            db.get(sel, [id], (e2, row) => {
                if (e2) return res.status(500).json({ error: e2.message });
                res.json(row);
                if (semanticChanged) setImmediate(() => queuePlaceVectorSync(id));
            });
        });
    });
});

// 删除地点（仅创建者或管理员）
router.delete("/:id", requireAuth, (req, res) => {
    const id = req.params.id;
    const selPlaceSql = `SELECT p.*, u.username AS creator_name, uu.username AS updated_by_name
                        FROM Place p
                        LEFT JOIN User u ON p.creator_id = u.id
                        LEFT JOIN User uu ON p.updated_by = uu.id
                        WHERE p.id = ?`;
    db.get(selPlaceSql, [id], (err, place) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!place) return res.status(404).json({ error: "地点不存在" });
        const isCreator = String(place.creator_id) === String(req.user.id);
        const canManagePlaces = hasPermission(req.user, "manage_places");
        if (!isCreator && !canManagePlaces) {
            return res.status(403).json({ error: "没有权限删除" });
        }
        db.run("DELETE FROM Place WHERE id = ?", [id], function (e) {
            if (e) return res.status(500).json({ error: e.message });
            try { deletePlaceVector(id); } catch (vectorError) {
                console.warn(`Failed to delete vector for place ${id}:`, vectorError.message);
            }
            res.json({ success: true });
        });
    });
});

module.exports = router;
