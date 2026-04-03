const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { init } = require("./db");

const placesRouter = require("./routes/places");
const commentsRouter = require("./routes/comments");
const usersRouter = require("./routes/users");
const searchRouter = require('./routes/search');
const adminUsersRouter = require("./routes/admin/adminUsers");
const adminInvitesRouter = require("./routes/admin/adminInvites");
const adminCommentsRouter = require("./routes/admin/adminComments");
const adminGeneralUsersRouter = require("./routes/admin/adminGeneralUsers");
const adminAuditRouter = require('./routes/admin/adminAudit');
const placeRequestsRouter = require("./routes/placeRequests");
const { requireAuth } = require("./middleware/auth");


const app = express();
// When running behind an HTTPS reverse proxy (e.g. nginx), enable trust proxy
// so Express respects X-Forwarded-* headers and req.secure reflects the original protocol.
app.set('trust proxy', true);

const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 3000;

const STATIC_ALLOWED_ORIGINS = [
    "http://8.210.201.2",
    "https://8.210.201.2",
    "http://8.210.201.2:3000",
    "https://8.210.201.2:3000",
    "http://localhost:3000",
    "https://localhost:3000",
    "http://localhost:5173",
    "https://localhost:5173",
    "http://127.0.0.1:3000",
    "https://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "https://127.0.0.1:5173"
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

app.use(cors({
    origin: (origin, callback) => {
        // origin 为空时（例如某些本地请求或 curl），允许通过
        if (!origin) {
            return callback(null, true);
        }
        if (isAllowedOrigin(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 3600
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// mount admin routers under /admin
app.use("/admin/users", requireAuth, adminUsersRouter);
app.use("/admin/invites", requireAuth, adminInvitesRouter);
app.use("/admin/comments", requireAuth, adminCommentsRouter);
app.use("/admin/general-users", requireAuth, adminGeneralUsersRouter);
app.use("/admin/audit", requireAuth, adminAuditRouter);


init();

app.use('/api', searchRouter);
app.use("/places", placesRouter);
app.use("/comments", commentsRouter);
app.use("/users", usersRouter);
app.use("/place-requests", placeRequestsRouter);
app.use("/api/place-requests", placeRequestsRouter); // 兼容前端或旧接口可能带 /api 前缀

app.get("/", (req, res) => res.json({ ok: true, msg: "yUYUko Food Map Backend" }));

app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
});
