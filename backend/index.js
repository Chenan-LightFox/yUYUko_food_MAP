const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const https = require("https");
const path = require("path");
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
const dinnersRouter = require("./routes/dinners");
const favoritesRouter = require("./routes/favorites");
const { requireAuth } = require("./middleware/auth");
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
// When running behind an HTTPS reverse proxy (e.g. nginx), enable trust proxy
// so Express respects X-Forwarded-* headers and req.secure reflects the original protocol.
app.set('trust proxy', true);

const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 2053;

const STATIC_ALLOWED_ORIGINS = [
    "http://localhost:2053",
    "https://localhost:2053",
    "http://localhost:5173",
    "https://localhost:5173",
    "http://127.0.0.1:2053",
    "https://127.0.0.1:2053",
    "http://127.0.0.1:5173",
    "https://127.0.0.1:5173"
];
// Add common production origins to avoid CORS issues when frontend is served from a different host/port
STATIC_ALLOWED_ORIGINS.push(
    "https://dinnerparty.cc",
    "https://www.dinnerparty.cc",
    "https://cn.dinnerparty.cc",
    "https://cn.dinnerparty.cc:8443",
    "https://dinnerparty.cc:8443"
);
const EXTRA_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

function isAllowedOrigin(origin) {
    if (!origin) return true;
    if (STATIC_ALLOWED_ORIGINS.includes(origin)) return true;
    if (EXTRA_ALLOWED_ORIGINS.includes(origin)) return true;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
    if (/^https?:\/\/cn\.dinnerparty\.cc(:\d+)?$/i.test(origin)) return true;
    if (/^https?:\/\/dinnerparty\.cc(:\d+)?$/i.test(origin)) return true;
    return false;
}

app.use(cors({
    origin: (origin, callback) => {
        // origin 为空时（例如某些本地请求或 curl），允许通过
        if (!origin) {
            console.log('CORS: request with no Origin header (allowing)');
            return callback(null, true);
        }
        const allowed = isAllowedOrigin(origin);
        if (allowed) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 3600
}));

const AMAP_JS_CODE = process.env.AMAP_JS_CODE || '03eac183dd628c79981e675c8cab45f8';

function appendQueryParam(rawPath, key, value) {
    const [pathname, query = ''] = String(rawPath || '').split('?');
    const params = new URLSearchParams(query);
    if (!params.has(key)) {
        params.set(key, value);
    }
    const nextQuery = params.toString();
    return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function isAmapRestApiPath(urlPath) {
    const p = String(urlPath || '');
    return p.includes('/v3/') || p.includes('/v4/') || p.includes('/v5/');
}

function rewriteAmapPath(pathValue) {
    const stripped = String(pathValue || '').replace(/^\/_AMapService/, '');
    return appendQueryParam(stripped, 'jscode', AMAP_JS_CODE);
}

function handleAmapProxyReq(proxyReq, req) {
    // pathRewrite should already handle jscode, but keep this as a runtime safety net.
    const updatedPath = rewriteAmapPath(proxyReq.path || req.url);
    proxyReq.path = updatedPath;

    // 根据 router 逻辑，动态设置 Host（兼容部分上游网关对 Host 的校验）
    if (isAmapRestApiPath(req.url)) {
        proxyReq.setHeader('Host', 'restapi.amap.com');
    } else {
        proxyReq.setHeader('Host', 'api.amap.com');
    }
}

app.use(
    '/_AMapService',
    createProxyMiddleware({
        target: 'https://api.amap.com/',
        changeOrigin: true,
        // Always inject jscode here so it works even when proxyReq hook is not fired.
        pathRewrite: (path) => rewriteAmapPath(path),
        router: function (req) {
            // 根据路径动态选择被代理的服务器地址，PlaceSearch组件（/v3/place/text）等都在restapi
            if (isAmapRestApiPath(req.url)) {
                return 'https://restapi.amap.com/';
            }
            return 'https://api.amap.com/';
        },
        // v2 compatibility
        onProxyReq: handleAmapProxyReq,
        // v3 style
        on: {
            proxyReq: handleAmapProxyReq
        }
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files for uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/upload', requireAuth, require('./routes/upload'));

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
app.use("/dinners", dinnersRouter);
app.use("/api/dinners", dinnersRouter);
app.use("/api/favorites", favoritesRouter);

app.get("/", (req, res) => res.json({ ok: true, msg: "yUYUko Food Map Backend" }));

// HTTPS support: if cert and key files exist (or set via env), run HTTPS server.
const SSL_KEY_PATH = 'C:\\certbot\\conf\\windows_ready_dinnerparty.cc\\privkey.pem';
const SSL_CERT_PATH = 'C:\\certbot\\conf\\windows_ready_dinnerparty.cc\\fullchain.pem';
const FORCE_HTTPS = process.env.FORCE_HTTPS === 'true';

if (fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
    const options = {
        key: fs.readFileSync(SSL_KEY_PATH),
        cert: fs.readFileSync(SSL_CERT_PATH)
    };
    https.createServer(options, app).listen(PORT, HOST, () => {
        console.log(`HTTPS server running on https://${HOST}:${PORT}`);
    });

    if (FORCE_HTTPS) {
        const http = require('http');
        const HTTP_PORT = process.env.HTTP_PORT || 80;
        http.createServer((req, res) => {
            const hostHeader = req.headers.host ? req.headers.host.split(':')[0] : HOST;
            const target = `https://${hostHeader}:${PORT}${req.url}`;
            res.writeHead(301, { Location: target });
            res.end();
        }).listen(HTTP_PORT, HOST, () => {
            console.log(`HTTP -> HTTPS redirector running on http://${HOST}:${HTTP_PORT}`);
        });
    }
} else {
    app.listen(PORT, HOST, () => {
        console.log(`Server running on http://${HOST}:${PORT}`);
        console.log(`TLS cert/key not found at ${SSL_CERT_PATH} and ${SSL_KEY_PATH}; running HTTP.`);
    });
}
