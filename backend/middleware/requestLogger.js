const crypto = require('crypto');
const logger = require('../utils/logger');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const SENSITIVE_QUERY_KEY = /password|passwd|pwd|token|authorization|secret|invite.?code|jwt|api.?key/i;
const DEFAULT_NOISY_PREFIXES = ['/_AMapService', '/uploads'];

function parsePositiveInt(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

const slowRequestMs = parsePositiveInt(process.env.LOG_SLOW_REQUEST_MS, 1500, 1, 600000);
const noisyPrefixes = String(process.env.LOG_NOISY_PATH_PREFIXES || DEFAULT_NOISY_PREFIXES.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

function getRequestId(req) {
    let queryRequestId = '';
    try {
        queryRequestId = new URL(req.originalUrl || req.url || '/', 'http://logger.local').searchParams.get('request_id') || '';
    } catch (error) { }
    const supplied = String(req.get('X-Request-ID') || queryRequestId).trim();
    return REQUEST_ID_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
}

function sanitizeUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl || '/', 'http://logger.local');
        for (const key of parsed.searchParams.keys()) {
            if (SENSITIVE_QUERY_KEY.test(key)) parsed.searchParams.set(key, '[REDACTED]');
        }
        return `${parsed.pathname}${parsed.search}`;
    } catch (error) {
        return String(rawUrl || '/').slice(0, 2000);
    }
}

function shortHeader(value, maxLength = 500) {
    const text = String(value || '');
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function summarizeErrorResponse(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
    const summary = {};
    for (const key of ['error', 'detail', 'code', 'reason']) {
        if (body[key] !== undefined) summary[key] = body[key];
    }
    return Object.keys(summary).length ? summary : undefined;
}

function requestLogger(req, res, next) {
    const requestId = getRequestId(req);
    const startedAt = process.hrtime.bigint();
    const requestPath = sanitizeUrl(req.originalUrl || req.url);
    const noisy = noisyPrefixes.some((prefix) => requestPath.startsWith(prefix));
    let connectionClosedLogged = false;

    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    res.locals.requestId = requestId;

    const originalJson = res.json.bind(res);
    res.json = (body) => {
        let responseBody = body;
        if (res.statusCode >= 400 && body && typeof body === 'object' && !Array.isArray(body)) {
            responseBody = body.requestId ? body : { ...body, requestId };
            res.locals.responseError = summarizeErrorResponse(responseBody);
        }
        return originalJson(responseBody);
    };

    logger.runWithContext({ requestId }, () => {
        const baseFields = {
            method: req.method,
            path: requestPath,
            ip: req.ip,
            origin: shortHeader(req.get('Origin')),
            userAgent: shortHeader(req.get('User-Agent')),
            requestContentType: shortHeader(req.get('Content-Type'), 200),
            requestContentLength: req.get('Content-Length') || undefined
        };

        if (!noisy) {
            logger.info('HTTP request started', {
                event: 'http.request.started',
                ...baseFields
            });
        }

        res.on('finish', () => {
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
            const fields = {
                event: 'http.request.completed',
                ...baseFields,
                status: res.statusCode,
                durationMs: Number(durationMs.toFixed(1)),
                responseContentLength: res.getHeader('Content-Length'),
                userId: req.user && req.user.id,
                responseError: res.locals.responseError
            };
            if (res.statusCode >= 500) logger.error('HTTP request completed with server error', fields);
            else if (res.statusCode >= 400) logger.warn('HTTP request completed with client error', fields);
            else if (durationMs >= slowRequestMs) logger.warn('Slow HTTP request completed', fields);
            else if (!noisy) logger.info('HTTP request completed', fields);
        });

        res.on('close', () => {
            if (res.writableFinished || connectionClosedLogged) return;
            connectionClosedLogged = true;
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
            logger.warn('HTTP connection closed before response completed', {
                event: 'http.request.aborted',
                ...baseFields,
                durationMs: Number(durationMs.toFixed(1)),
                userId: req.user && req.user.id
            });
        });

        next();
    });
}

function notFoundHandler(req, res) {
    return res.status(404).json({ error: '接口不存在' });
}

function errorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);
    const status = Number(error.status || error.statusCode);
    const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
    logger.error('Unhandled HTTP request error', {
        event: 'http.request.error',
        method: req.method,
        path: sanitizeUrl(req.originalUrl || req.url),
        status: safeStatus,
        userId: req.user && req.user.id,
        error
    });
    const publicMessage = safeStatus >= 500 ? '服务器内部错误' : (error.publicMessage || error.message || '请求失败');
    return res.status(safeStatus).json({
        error: publicMessage,
        code: error.code
    });
}

module.exports = { requestLogger, notFoundHandler, errorHandler, sanitizeUrl };
