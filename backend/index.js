const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { init } = require("./db");

const placesRouter = require("./routes/places");
const commentsRouter = require("./routes/comments");
const usersRouter = require("./routes/users");
const searchRouter = require('./routes/search');
const adminUsersRouter = require("./routes/admin/adminUsers");


const app = express();
const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = [
    "http://8.210.201.2",
    "http://8.210.201.2:3000",
    "http://localhost:3000",
    "http://localhost:5173"
];

app.use(cors({
    origin: (origin, callback) => {
        // origin 为空时（例如某些本地请求或 curl），允许通过
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
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

app.use("/admin/users", adminUsersRouter);


init();

app.use('/api', searchRouter);
app.use("/places", placesRouter);
app.use("/comments", commentsRouter);
app.use("/users", usersRouter);

app.get("/", (req, res) => res.json({ ok: true, msg: "yUYUko Food Map Backend" }));

app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
});
