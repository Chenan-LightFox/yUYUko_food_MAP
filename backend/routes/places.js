const express = require("express");
const router = express.Router();
const { db } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { hasPermission } = require("../utils/adminPermissions");

const PLACE_NAME_MAX_LENGTH = 120;
const PLACE_CATEGORY_MAX_LENGTH = 60;
const PLACE_DESCRIPTION_MAX_LENGTH = 1000;
const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/i;

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

// 列出所有地点
router.get("/", (req, res) => {
    db.all("SELECT * FROM Place ORDER BY created_time DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 按 bounds 查询范围内地点
router.get("/nearby", (req, res) => {
    const { minLng, minLat, maxLng, maxLat } = req.query;
    if (![minLng, minLat, maxLng, maxLat].every(Boolean)) return res.status(400).json({ error: "缺少范围参数" });
    const sql = `SELECT * FROM Place WHERE longitude BETWEEN ? AND ? AND latitude BETWEEN ? AND ?`;
    db.all(sql, [minLng, maxLng, minLat, maxLat], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 添加地点
router.post("/", requireAuth, (req, res) => {
    const { name, description, latitude, longitude, category } = req.body;
    const creatorId = req.user.id;
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

    const sql = `INSERT INTO Place (name, description, latitude, longitude, category, creator_id) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [
        normalizedName.value,
        normalizedDescription.value,
        normalizedLatitude.value,
        normalizedLongitude.value,
        normalizedCategory.value,
        creatorId
    ], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get("SELECT * FROM Place WHERE id = ?", [this.lastID], (e, row) => {
            if (e) return res.status(500).json({ error: e.message });
            res.json(row);
        });
    });
});

// 删除地点（仅创建者或管理员）
router.delete("/:id", requireAuth, (req, res) => {
    const id = req.params.id;
    db.get("SELECT * FROM Place WHERE id = ?", [id], (err, place) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!place) return res.status(404).json({ error: "地点不存在" });
        const isCreator = String(place.creator_id) === String(req.user.id);
        const canManagePlaces = hasPermission(req.user, "manage_places");
        if (!isCreator && !canManagePlaces) {
            return res.status(403).json({ error: "没有权限删除" });
        }
        db.run("DELETE FROM Place WHERE id = ?", [id], function (e) {
            if (e) return res.status(500).json({ error: e.message });
            res.json({ success: true });
        });
    });
});

module.exports = router;
