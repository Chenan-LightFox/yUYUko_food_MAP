const express = require("express");
const router = express.Router();
const { db } = require("../db");
const { requireAuth } = require("../middleware/auth");

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 1200;
const PLACE_MAX = 120;
const CONTACT_MAX = 200;

function sanitizeText(input, { required = false, max = 200, field = "字段" } = {}) {
    if (input == null || input === "") {
        if (required) return { error: `${field}不能为空` };
        return { value: "" };
    }
    if (typeof input !== "string") return { error: `${field}必须是字符串` };
    const value = input.trim();
    if (required && !value) return { error: `${field}不能为空` };
    if (value.length > max) return { error: `${field}不能超过 ${max} 个字符` };
    return { value };
}

function normalizeStartTime(raw) {
    if (!raw) return { error: "开始时间不能为空" };
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return { error: "开始时间格式无效" };
    }
    return { value: parsed.toISOString() };
}

function normalizeMaxParticipants(raw) {
    if (raw == null || raw === "") return { value: null };
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 2 || n > 1000) {
        return { error: "人数上限应为 2-1000 的整数" };
    }
    return { value: n };
}

function htmlEscape(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function buildFrontendDinnerUrl(req, id) {
    const configured = process.env.FRONTEND_BASE_URL;
    if (configured) {
        return `${String(configured).replace(/\/+$/, "")}/dinners/${id}`;
    }

    const protocol = req.protocol || "http";
    const host = req.get("host") || "localhost:2053";
    if (/^(localhost|127\.0\.0\.1):2053$/i.test(host)) {
        return `${protocol}://${host.replace(/:2053$/i, ":5173")}/dinners/${id}`;
    }
    return `${protocol}://${host}/dinners/${id}`;
}

function buildShareDescription(row) {
    const start = row && row.start_time ? new Date(row.start_time) : null;
    const timeText = start && !Number.isNaN(start.getTime()) ? start.toLocaleString("zh-CN", { hour12: false }) : "时间待定";
    const placeText = row && row.place_name ? row.place_name : "地点待定";
    const maxText = row && row.max_participants ? `，最多 ${row.max_participants} 人` : "";
    return `${timeText} · ${placeText}${maxText}`;
}

function buildOgImageSvg(row) {
    const title = htmlEscape((row && row.title) || "发起聚餐");
    const desc = htmlEscape(buildShareDescription(row));
    const creator = htmlEscape((row && row.creator_name) || "匿名用户");
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#102a43" />
      <stop offset="100%" stop-color="#243b53" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" rx="36" ry="36" />
  <rect x="60" y="72" width="1080" height="486" rx="28" ry="28" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.24)" />
  <text x="120" y="190" fill="#eaf4ff" font-size="46" font-weight="700" font-family="'Microsoft YaHei','PingFang SC',sans-serif">东方饭联地图 · 聚餐活动</text>
  <text x="120" y="288" fill="#ffffff" font-size="64" font-weight="700" font-family="'Microsoft YaHei','PingFang SC',sans-serif">${title}</text>
  <text x="120" y="372" fill="#d6e8ff" font-size="38" font-family="'Microsoft YaHei','PingFang SC',sans-serif">${desc}</text>
  <text x="120" y="460" fill="#bcd7ff" font-size="30" font-family="'Microsoft YaHei','PingFang SC',sans-serif">发起人：${creator}</text>
</svg>`;
}

function serializeDinner(row) {
    if (!row) return null;
    return {
        ...row,
        max_participants: row.max_participants == null ? null : Number(row.max_participants)
    };
}

router.get("/", (req, res) => {
    db.all(
        `SELECT d.*, u.username AS creator_name
         FROM DinnerEvent d
         LEFT JOIN User u ON u.id = d.creator_id
         ORDER BY d.start_time ASC
         LIMIT 50`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            return res.json((rows || []).map(serializeDinner));
        }
    );
});

router.get("/:id", (req, res) => {
    db.get(
        `SELECT d.*, u.username AS creator_name
         FROM DinnerEvent d
         LEFT JOIN User u ON u.id = d.creator_id
         WHERE d.id = ?`,
        [req.params.id],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: "聚餐活动不存在" });
            return res.json(serializeDinner(row));
        }
    );
});

router.post("/", requireAuth, (req, res) => {
    const { title, description, place_name, start_time, max_participants, contact_info } = req.body || {};

    const t = sanitizeText(title, { required: true, max: TITLE_MAX, field: "标题" });
    if (t.error) return res.status(400).json({ error: t.error });

    const d = sanitizeText(description, { required: false, max: DESCRIPTION_MAX, field: "活动说明" });
    if (d.error) return res.status(400).json({ error: d.error });

    const p = sanitizeText(place_name, { required: true, max: PLACE_MAX, field: "聚餐地点" });
    if (p.error) return res.status(400).json({ error: p.error });

    const s = normalizeStartTime(start_time);
    if (s.error) return res.status(400).json({ error: s.error });

    const m = normalizeMaxParticipants(max_participants);
    if (m.error) return res.status(400).json({ error: m.error });

    const c = sanitizeText(contact_info, { required: false, max: CONTACT_MAX, field: "联系方式" });
    if (c.error) return res.status(400).json({ error: c.error });

    db.run(
        `INSERT INTO DinnerEvent (title, description, place_name, start_time, max_participants, contact_info, creator_id, updated_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [t.value, d.value, p.value, s.value, m.value, c.value, req.user.id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            db.get(
                `SELECT d.*, u.username AS creator_name
                 FROM DinnerEvent d
                 LEFT JOIN User u ON u.id = d.creator_id
                 WHERE d.id = ?`,
                [this.lastID],
                (e2, row) => {
                    if (e2) return res.status(500).json({ error: e2.message });
                    return res.status(201).json(serializeDinner(row));
                }
            );
        }
    );
});

router.delete("/:id", requireAuth, (req, res) => {
    db.get(
        `SELECT id, creator_id
         FROM DinnerEvent
         WHERE id = ?`,
        [req.params.id],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: "聚餐活动不存在" });

            const isCreator = String(row.creator_id) === String(req.user.id);
            const isAdmin = !!(req.user && req.user.admin_level);
            if (!isCreator && !isAdmin) {
                return res.status(403).json({ error: "仅活动发起人或管理员可删除该聚餐" });
            }

            db.run("DELETE FROM DinnerEvent WHERE id = ?", [req.params.id], function (e2) {
                if (e2) return res.status(500).json({ error: e2.message });
                return res.json({ success: true, id: Number(req.params.id) });
            });
        }
    );
});

router.get("/:id/og-image", (req, res) => {
    db.get(
        `SELECT d.*, u.username AS creator_name
         FROM DinnerEvent d
         LEFT JOIN User u ON u.id = d.creator_id
         WHERE d.id = ?`,
        [req.params.id],
        (err, row) => {
            if (err) return res.status(500).type("text/plain").send("server error");
            if (!row) return res.status(404).type("text/plain").send("not found");
            res.set("Content-Type", "image/svg+xml; charset=utf-8");
            res.set("Cache-Control", "public, max-age=300");
            return res.send(buildOgImageSvg(row));
        }
    );
});

router.get("/:id/share", (req, res) => {
    db.get(
        `SELECT d.*, u.username AS creator_name
         FROM DinnerEvent d
         LEFT JOIN User u ON u.id = d.creator_id
         WHERE d.id = ?`,
        [req.params.id],
        (err, row) => {
            if (err) return res.status(500).send("Server Error");
            if (!row) return res.status(404).send("Dinner not found");

            const title = `${row.title} | 聚餐活动`;
            const description = buildShareDescription(row);
            const shareUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
            const imageUrl = `${req.protocol}://${req.get("host")}/dinners/${row.id}/og-image`;
            const frontendUrl = buildFrontendDinnerUrl(req, row.id);

            const safeTitle = htmlEscape(title);
            const safeDescription = htmlEscape(description);
            const safeCreator = htmlEscape(row.creator_name || "匿名用户");
            const safeDetail = htmlEscape(row.description || "暂无活动说明");

            res.set("Content-Type", "text/html; charset=utf-8");
            return res.send(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}" />

  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="东方饭联地图" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDescription}" />
  <meta property="og:url" content="${htmlEscape(shareUrl)}" />
  <meta property="og:image" content="${htmlEscape(imageUrl)}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDescription}" />
  <meta name="twitter:image" content="${htmlEscape(imageUrl)}" />

  <style>
    body { margin:0; font-family: "Microsoft YaHei", "PingFang SC", sans-serif; background:#f4f7fb; color:#102a43; }
    .wrap { max-width: 760px; margin: 40px auto; padding: 24px; }
    .card { background:white; border-radius:16px; padding:24px; box-shadow:0 8px 40px rgba(16,42,67,0.12); }
    h1 { margin: 0 0 12px; font-size: 32px; }
    p { margin: 8px 0; line-height: 1.6; }
    .meta { color:#486581; }
    .btn { display:inline-block; margin-top:16px; background:#0f609b; color:white; text-decoration:none; padding:10px 16px; border-radius:10px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${htmlEscape(row.title)}</h1>
      <p class="meta">${safeDescription}</p>
      <p>发起人：${safeCreator}</p>
      <p>${safeDetail}</p>
      <a class="btn" href="${htmlEscape(frontendUrl)}">打开聚餐详情页</a>
    </div>
  </div>
</body>
</html>`);
        }
    );
});

module.exports = router;
