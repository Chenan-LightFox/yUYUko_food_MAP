const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { init } = require("./db");

const placesRouter = require("./routes/places");
const commentsRouter = require("./routes/comments");
const usersRouter = require("./routes/users");
const searchRouter = require('./routes/search');
const adminUsersRouter = require("./routes/admin/adminUsers");
const { requireAuth } = require("./middleware/auth");


const app = express();
const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 3000;

const STATIC_ALLOWED_ORIGINS = [
    "http://8.210.201.2",
    "http://8.210.201.2:3000",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173"
];
const EXTRA_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

function isAllowedOrigin(origin) {
    if (!origin) return true;
    if (STATIC_ALLOWED_ORIGINS.includes(origin)) return true;
    if (EXTRA_ALLOWED_ORIGINS.includes(origin)) return true;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
    if (/^https?:\/\/8\.210\.201\.2(:\d+)?$/i.test(origin)) return true;
    return false;
}

// Debug: 全局打印 incoming Origin / Referer，放在 cors 之前以便观察每个请求（含预检）
app.use((req, res, next) => {
    try {
        console.log(`[CORS DEBUG] ${req.method} ${req.originalUrl} Origin:${req.headers.origin || '-'} Referer:${req.headers.referer || '-'}`);
    } catch (e) {
        console.warn('[CORS DEBUG] failed to log headers', e);
    }
    next();
});

app.use(cors({
    origin: (origin, callback) => {
        // origin 为空时（例如某些本地请求或 curl），允许通过
        if (!origin) {
            console.log('[CORS] origin absent -> allowed');
            return callback(null, true);
        }
        if (isAllowedOrigin(origin)) {
            console.log(`[CORS] Allowed origin: ${origin}`);
            return callback(null, true);
        }
        console.warn(`[CORS] Blocked origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 3600
}));

/////////////////////////
// 保留原始请求体用于调试：verify 回调会把 buf 存到 req.rawBody
app.use(bodyParser.json({
    verify: (req, res, buf, encoding) => {
        try {
            req.rawBody = buf && buf.toString(encoding || 'utf8');
        } catch (e) {
            req.rawBody = undefined;
        }
    }
}));

// 详细调试中间件：打印 raw body、长度、预览和前若干字节的 charCode
app.use((req, res, next) => {
    try {
        const ct = req.headers['content-type'] || '-';
        const cl = req.headers['content-length'] || '-';
        const raw = req.rawBody;
        console.log(`[RAW BODY DEBUG] ${req.method} ${req.originalUrl} Content-Type:${ct} Content-Length:${cl} rawLen:${raw ? raw.length : 0}`);
        if (raw) {
            // 打印前 200 字符的可读预览（避免日志太长）
            const preview = raw.length > 200 ? raw.slice(0, 200) + '...(truncated)' : raw;
            console.log('  Raw preview:', preview);
            // 打印前 16 个字符的 Unicode 码点（十进制），便于发现不可见字符或 BOM
            const codes = [];
            for (let i = 0; i < Math.min(16, raw.length); i++) codes.push(raw.charCodeAt(i));
            console.log('  Char codes (first 16):', codes);
        } else {
            console.log('  Raw body is empty or unavailable');
        }
    } catch (e) {
        console.warn('RAW BODY DEBUG failed', e);
    }
    next();
});

// 捕获 body-parser 的 JSON 解析错误并打印 rawBody（更友好）
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
        console.error('JSON parse error. Raw body (first 200 chars):', req.rawBody && req.rawBody.slice(0, 200));
        return res.status(400).json({ error: 'Invalid JSON in request body' });
    }
    next(err);
});
//////////////////////////

app.use("/admin/users", requireAuth, adminUsersRouter);


init();

app.use('/api', searchRouter);
app.use("/places", placesRouter);
app.use("/comments", commentsRouter);
app.use("/users", usersRouter);

app.get("/", (req, res) => res.json({ ok: true, msg: "yUYUko Food Map Backend" }));

app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
});
