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
    verify: (req, res, buf) => {
        try {
            req.rawBody = buf && buf.toString('utf8');
        } catch (e) {
            req.rawBody = undefined;
        }
    }
}));

// 可选：简单日志中间件，打印出方法/路径/Content-Type/Content-Length/原始 body（生产环境请移除）
app.use((req, res, next) => {
    try {
        console.log(`[RAW BODY DEBUG] ${req.method} ${req.originalUrl} Content-Type:${req.headers['content-type'] || '-'} Content-Length:${req.headers['content-length'] || '-'}\nRaw body ->`, req.rawBody);
    } catch (e) { /* ignore */ }
    next();
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
