const express = require("express");
const router = express.Router();
const { db } = require("../db");
const { requireAuth } = require("../middleware/auth");
const requireAdmin = require("../middleware/adminAuth");

// 提交地点修改申请（需登录）
router.post("/", requireAuth, (req, res) => {
    const { place_id, proposed, note } = req.body;
    const requester_id = req.user && req.user.id;
    if (!place_id || !proposed || typeof proposed !== "object") return res.status(400).json({ error: "缺少参数或 proposed 格式错误" });

    const proposedStr = JSON.stringify(proposed);
    db.run(`INSERT INTO PlaceRequest (place_id, requester_id, proposed, note) VALUES (?, ?, ?, ?)`, [place_id, requester_id, proposedStr, note || ""], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get("SELECT * FROM PlaceRequest WHERE id = ?", [this.lastID], (e, row) => {
            if (e) return res.status(500).json({ error: e.message });
            res.status(201).json(row);
        });
    });
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

    db.get("SELECT * FROM PlaceRequest WHERE id = ?", [id], (err, reqRow) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!reqRow) return res.status(404).json({ error: "申请不存在" });
        if (reqRow.status !== 'pending') return res.status(400).json({ error: "此申请已被处理" });

        if (action === 'reject') {
            db.run("UPDATE PlaceRequest SET status = ?, reviewed_by = ?, reviewed_time = CURRENT_TIMESTAMP WHERE id = ?", ['rejected', adminId, id], function (e) {
                if (e) return res.status(500).json({ error: e.message });
                res.json({ success: true });
            });
            return;
        }

        // approve: apply proposed changes to Place record if present
        let proposed;
        try { proposed = JSON.parse(reqRow.proposed); } catch (e) { proposed = null; }
        if (!proposed) return res.status(400).json({ error: "提议内容解析失败" });

        // Build SET clause dynamically
        const keys = Object.keys(proposed).filter(k => ['name','description','latitude','longitude','category','creator_id','updated_time','updated_by'].includes(k));
        if (keys.length === 0) return res.status(400).json({ error: "无可应用的变更" });
        const sets = keys.map(k => `${k} = ?`).join(', ');
        const values = keys.map(k => proposed[k]);

        db.run(`UPDATE Place SET ${sets} WHERE id = ?`, [...values, reqRow.place_id], function (e) {
            if (e) return res.status(500).json({ error: e.message });
            db.run("UPDATE PlaceRequest SET status = ?, reviewed_by = ?, reviewed_time = CURRENT_TIMESTAMP WHERE id = ?", ['approved', adminId, id], function (e2) {
                if (e2) return res.status(500).json({ error: e2.message });
                res.json({ success: true });
            });
        });
    });
});

function tryParseJSON(v) {
    try { return JSON.parse(v); } catch (e) { return v; }
}

module.exports = router;
