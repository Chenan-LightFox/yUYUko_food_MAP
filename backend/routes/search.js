const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { fuzzySearch } = require('../utils/fuzzySearch'); // 模糊搜索，保留字段

function normalizeText(s) {
    return (s || "").toString().trim().toLowerCase();
}

// 非连续字符匹配
function isSubsequence(term, text) {
    if (!term) return true;
    if (!text) return false;
    let i = 0, j = 0;
    const t = term.toLowerCase();
    const s = text.toLowerCase();
    while (i < t.length && j < s.length) {
        if (t[i] === s[j]) i++;
        j++;
    }
    return i === t.length;
}

// Haversine method 计算距离(m)
function haversineDistance(lat1, lng1, lat2, lng2) {
    const toRad = (v) => v * Math.PI / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function getAllPlaces(opts = {}) {
    const q = (opts.q || "").toString().trim();
    const term = normalizeText(q);
    const center = opts.center; // { lat, lng } 或 undefined
    const limit = Number.isInteger(opts.limit) ? opts.limit : undefined;

    // 获取所有地点数据（附带创建者和最后修改者姓名）
    const rows = await new Promise((resolve, reject) => {
        const sql = `SELECT p.*, u.username AS creator_name, uu.username AS updated_by_name
                     FROM Place p
                     LEFT JOIN User u ON p.creator_id = u.id
                     LEFT JOIN User uu ON p.updated_by = uu.id`;
        db.all(sql, [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });

    // 如果没有关键字，则按距离或按创建时间降序返回
    if (!term) {
        let list = rows.slice();
        if (center && center.lat != null && center.lng != null) {
            list.forEach(p => {
                p.__distance = haversineDistance(center.lat, center.lng, p.latitude, p.longitude);
            });
            list.sort((a, b) => a.__distance - b.__distance);
        } else {
            // 按 created_time 降序（若不存在则保持原序）
            list.sort((a, b) => {
                if (!a.created_time && !b.created_time) return 0;
                if (!a.created_time) return 1;
                if (!b.created_time) return -1;
                return new Date(b.created_time) - new Date(a.created_time);
            });
        }
        if (limit) return list.slice(0, limit);
        return list;
    }

    // 有关键字的情况：分组并排序
    const matched = [];

    const t = term.toLowerCase();

    for (const p of rows) {
        const name = normalizeText(p.name || "");
        const category = normalizeText(p.category || "");
        const description = normalizeText(p.description || "");

        const nameContains = name.indexOf(t) !== -1;
        const categoryContains = category.indexOf(t) !== -1;
        const descContains = description.indexOf(t) !== -1;
        const nameSubseq = isSubsequence(t, name);

        if (!nameContains && !nameSubseq && !categoryContains && !descContains) continue;

        // 决定 rank：越小优先级越高
        // 0: 名称连续匹配（严格连续字符匹配）
        // 1: 名称非连续字符匹配（子序列）
        // 2: 分类匹配
        // 3: 描述匹配
        let rank = 99;
        if (nameContains) rank = 0;
        else if (nameSubseq) rank = 1;
        else if (categoryContains) rank = 2;
        else if (descContains) rank = 3;

        // 计算距离
        let distance = Number.POSITIVE_INFINITY;
        if (center && center.lat != null && center.lng != null && p.latitude != null && p.longitude != null) {
            distance = haversineDistance(center.lat, center.lng, p.latitude, p.longitude);
        }

        matched.push({
            place: p,
            rank,
            distance
        });
    }

    // 按 rank -> distance -> 创建时间降序（同 rank 同距离时）排序
    matched.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        if (a.distance !== b.distance) return a.distance - b.distance;
        const at = a.place.created_time ? new Date(a.place.created_time).getTime() : 0;
        const bt = b.place.created_time ? new Date(b.place.created_time).getTime() : 0;
        return bt - at;
    });

    const results = matched.map(m => m.place);
    if (limit) return results.slice(0, limit);
    return results;
}

// GET /places/search?q=关键字&limit=50&centerLat=...&centerLng=...
router.get('/places/search', async (req, res) => {
    try {
        const q = req.query.q || "";
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
        const centerLat = req.query.centerLat ? parseFloat(req.query.centerLat) : undefined;
        const centerLng = req.query.centerLng ? parseFloat(req.query.centerLng) : undefined;
        const center = (centerLat != null && centerLng != null) ? { lat: centerLat, lng: centerLng } : undefined;

        const places = await getAllPlaces({ q, center, limit });
        res.json(places);
    } catch (err) {
        console.error("places search error:", err);
        res.status(500).json({ error: err.message || "internal error" });
    }
});

module.exports = router;
