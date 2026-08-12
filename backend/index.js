const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const https = require("https");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const logger = require('./utils/logger');
const { requestLogger, notFoundHandler, errorHandler } = require('./middleware/requestLogger');

// Capture legacy console.* calls from every subsequently loaded module and make
// sure process-level crashes are persisted before Node exits.
logger.installConsoleBridge();
logger.installProcessHandlers();

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
const adminQQWhitelistRouter = require('./routes/admin/adminQQWhitelist');
const adminNoticesRouter = require('./routes/admin/adminNotices');
const placeRequestsRouter = require("./routes/placeRequests");
const dinnersRouter = require("./routes/dinners");
const favoritesRouter = require("./routes/favorites");
const noticesRouter = require("./routes/notices");
const categoriesRouter = require("./routes/categories");
const { requireAuth } = require("./middleware/auth");
const { createProxyMiddleware } = require('http-proxy-middleware');
const { startVectorRetryWorker } = require('./services/placeVectorService');

const app = express();
// When running behind an HTTPS reverse proxy (e.g. nginx), enable trust proxy
// so Express respects X-Forwarded-* headers and req.secure reflects the original protocol.
app.set('trust proxy', true);
app.disable('x-powered-by');

const HOST = process.env.HOST || "127.0.0.1";
const PORT = process.env.PORT || 7000;

// Must run before CORS/body parsing so rejected preflights, malformed JSON and
// aborted requests all receive the same request ID and access log coverage.
app.use(requestLogger);

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
    if (/^https?:\/\/([a-z0-9-]+\.)*dinnerparty\.cc(:\d+)?$/i.test(origin)) return true;
    return false;
}

app.use(cors({
    origin: (origin, callback) => {
        // origin 为空时（例如某些本地请求或 curl），允许通过
        if (!origin) {
            return callback(null, true);
        }
        const allowed = isAllowedOrigin(origin);
        if (allowed) {
            return callback(null, true);
        }
        logger.warn('CORS origin rejected', {
            event: 'security.cors.rejected',
            origin
        });
        const error = new Error('请求来源不被允许');
        error.status = 403;
        error.code = 'CORS_NOT_ALLOWED';
        error.publicMessage = '请求来源不被允许';
        return callback(error);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
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

function handleAmapProxyError(error, req, res) {
    logger.error('AMap proxy request failed', {
        event: 'proxy.amap.failed',
        method: req && req.method,
        path: req && req.url,
        error
    });
    if (!res || res.headersSent) return;
    if (typeof res.status === 'function' && typeof res.json === 'function') {
        return res.status(502).json({ error: '地图服务暂时不可用' });
    }
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: '地图服务暂时不可用', requestId: req && req.requestId }));
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
        onError: handleAmapProxyError,
        // v3 style
        on: {
            proxyReq: handleAmapProxyReq,
            error: handleAmapProxyError
        }
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CLIENT_AUTH_STAGES = new Set([
    'submitted',
    'response_received',
    'success_payload_valid',
    'success_callback_started',
    'success_callback_returned',
    'state_commit_started',
    'state_commit_finished',
    'request_timed_out',
    'request_failed'
]);
const clientAuthDiagnosticRate = new Map();

app.post('/diagnostics/client-auth', (req, res) => {
    const now = Date.now();
    const rateKey = req.ip || 'unknown';
    const current = clientAuthDiagnosticRate.get(rateKey);
    const rate = !current || now - current.startedAt >= 60000
        ? { startedAt: now, count: 1 }
        : { ...current, count: current.count + 1 };
    clientAuthDiagnosticRate.set(rateKey, rate);
    if (rate.count > 60) return res.status(204).end();

    const stage = String((req.body && req.body.stage) || req.query.stage || '').trim();
    if (CLIENT_AUTH_STAGES.has(stage)) {
        logger.info('Client authentication stage', {
            event: 'auth.client.stage',
            stage,
            detail: String((req.body && req.body.detail) || req.query.detail || '').slice(0, 160),
            userAgent: String(req.get('User-Agent') || '').slice(0, 500)
        });
    }
    return res.status(204).end();
});

// Serve static files for uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/upload', requireAuth, require('./routes/upload'));

// mount admin routers under /admin
app.use("/admin/users", requireAuth, adminUsersRouter);
app.use("/admin/invites", requireAuth, adminInvitesRouter);
app.use("/admin/comments", requireAuth, adminCommentsRouter);
app.use("/admin/general-users", requireAuth, adminGeneralUsersRouter);
app.use("/admin/audit", requireAuth, adminAuditRouter);
app.use("/admin/qq-whitelist", requireAuth, adminQQWhitelistRouter);
app.use("/admin/notices", requireAuth, adminNoticesRouter);
app.use("/api/admin/notices", requireAuth, adminNoticesRouter);


init();
startVectorRetryWorker();

app.use('/api', searchRouter);
app.use("/places", placesRouter);
app.use("/p", require("./routes/placeShare"));
app.use("/comments", commentsRouter);
app.use("/users", usersRouter);
app.use("/notices", noticesRouter);
app.use("/api/notices", noticesRouter);
app.use("/categories", categoriesRouter);
app.use("/api/categories", categoriesRouter);
app.use("/place-requests", placeRequestsRouter);
app.use("/api/place-requests", placeRequestsRouter); // 兼容前端或旧接口可能带 /api 前缀
app.use("/dinners", dinnersRouter);
app.use("/api/dinners", dinnersRouter);
app.use("/api/favorites", favoritesRouter);

app.get("/", (req, res) => res.json({ ok: true, msg: "yUYUko Food Map Backend" }));

app.use(notFoundHandler);
app.use(errorHandler);

// HTTP only (reverse proxy handles HTTPS termination)
const server = app.listen(PORT, HOST, () => {
    logger.info('Backend server started', {
        event: 'server.started',
        host: HOST,
        port: Number(PORT),
        nodeVersion: process.version,
        logLevel: logger.config.level,
        logDirectory: logger.config.directory
    });
});

server.on('error', (error) => {
    logger.fatal('Backend server error', { event: 'server.error', error });
    const forceExit = setTimeout(() => process.exit(1), 1000);
    logger.flush().finally(() => {
        clearTimeout(forceExit);
        process.exit(1);
    });
});

let shutdownStarted = false;
function gracefulShutdown(signal) {
    if (shutdownStarted) return;
    shutdownStarted = true;
    logger.info('Backend shutdown started', { event: 'server.shutdown', signal });
    const forceExit = setTimeout(() => process.exit(1), 5000);
    server.close(async (error) => {
        if (error) logger.error('Backend shutdown failed', { event: 'server.shutdown_failed', error });
        else logger.info('Backend server stopped', { event: 'server.stopped', signal });
        await logger.flush();
        clearTimeout(forceExit);
        process.exit(error ? 1 : 0);
    });
}

process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGINT', () => gracefulShutdown('SIGINT'));
