const fs = require('fs');
const path = require('path');
const util = require('util');
const { AsyncLocalStorage } = require('async_hooks');

const BACKEND_DIR = path.resolve(__dirname, '..');
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50, off: 100 };
const SENSITIVE_KEY = /password|passwd|pwd|token|authorization|cookie|secret|invite.?code|jwt|api.?key|avatar.?blob/i;
const MAX_DEPTH = 5;
const MAX_KEYS = 60;
const MAX_ARRAY_ITEMS = 30;

const originalConsole = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
};

function parseBoolean(value, fallback) {
    if (value == null || value === '') return fallback;
    return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

function parsePositiveInt(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function resolveLogDirectory(value) {
    if (!value) return path.join(BACKEND_DIR, 'logs');
    return path.isAbsolute(value) ? value : path.resolve(BACKEND_DIR, value);
}

const configuredLevel = String(process.env.LOG_LEVEL || 'info').trim().toLowerCase();
const config = {
    level: Object.prototype.hasOwnProperty.call(LEVELS, configuredLevel) ? configuredLevel : 'info',
    directory: resolveLogDirectory(process.env.LOG_DIR),
    toFile: parseBoolean(process.env.LOG_TO_FILE, true),
    toConsole: parseBoolean(process.env.LOG_TO_CONSOLE, true),
    prettyConsole: parseBoolean(process.env.LOG_PRETTY_CONSOLE, true),
    maxFileBytes: parsePositiveInt(process.env.LOG_MAX_FILE_MB, 20, 1, 1024) * 1024 * 1024,
    retentionDays: parsePositiveInt(process.env.LOG_RETENTION_DAYS, 14, 1, 3650),
    service: String(process.env.LOG_SERVICE_NAME || 'yuyuko-food-map-backend').trim()
};

const contextStorage = new AsyncLocalStorage();
const writerStates = new Map();
let fileLoggingAvailable = config.toFile;
let consoleBridgeInstalled = false;
let processHandlersInstalled = false;
let fatalShutdownStarted = false;

function localDateStamp(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function redactText(value) {
    return String(value)
        .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
        .replace(/\b(password|passwd|pwd|token|authorization|cookie|secret|invite[_ -]?code|jwt|api[_ -]?key)\b(\s*[:=]\s*)[^\s,;}]+/gi, '$1$2[REDACTED]')
        .replace(/(密码|令牌|邀请码)(\s*[:：=]\s*)[^\s,，；;}]+/g, '$1$2[REDACTED]');
}

function sanitize(value, depth = 0, seen = new WeakSet()) {
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'string') return redactText(value.length > 4000 ? `${value.slice(0, 4000)}…` : value);
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) {
        return {
            name: value.name,
            message: redactText(value.message || ''),
            code: value.code,
            status: value.status || value.statusCode,
            stack: value.stack ? redactText(value.stack) : undefined
        };
    }
    if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
    if (depth >= MAX_DEPTH) return '[Max depth reached]';
    if (typeof value !== 'object') return redactText(String(value));
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    if (Array.isArray(value)) {
        return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitize(item, depth + 1, seen));
    }

    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, MAX_KEYS)) {
        result[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitize(item, depth + 1, seen);
    }
    return result;
}

function cleanupOldLogs() {
    if (!fileLoggingAvailable) return;
    const cutoff = Date.now() - config.retentionDays * 24 * 60 * 60 * 1000;
    try {
        fs.mkdirSync(config.directory, { recursive: true });
        for (const name of fs.readdirSync(config.directory)) {
            if (!/^(app|error)-\d{4}-\d{2}-\d{2}(?:\.\d+)?\.log$/.test(name)) continue;
            const filePath = path.join(config.directory, name);
            const stat = fs.statSync(filePath);
            if (stat.mtimeMs < cutoff) fs.unlinkSync(filePath);
        }
    } catch (error) {
        fileLoggingAvailable = false;
        originalConsole.error(`[logger] Cannot initialize log directory ${config.directory}:`, error);
    }
}

function closeWriterState(state) {
    if (!state || !state.stream) return;
    state.stream.end();
    state.stream = null;
}

function nextLogFile(kind, dateStamp, bytesToWrite) {
    let index = 0;
    while (true) {
        const suffix = index === 0 ? '' : `.${index}`;
        const filePath = path.join(config.directory, `${kind}-${dateStamp}${suffix}.log`);
        let size = 0;
        try {
            size = fs.statSync(filePath).size;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        if (size === 0 || size + bytesToWrite <= config.maxFileBytes) return { filePath, size, index };
        index += 1;
    }
}

function ensureWriter(kind, bytesToWrite) {
    if (!fileLoggingAvailable) return null;
    const dateStamp = localDateStamp();
    let state = writerStates.get(kind);
    const mustRotate = state && (
        state.dateStamp !== dateStamp ||
        (state.bytes > 0 && state.bytes + bytesToWrite > config.maxFileBytes)
    );
    if (mustRotate) {
        closeWriterState(state);
        writerStates.delete(kind);
        state = null;
    }
    if (state && state.stream) return state;

    try {
        const next = nextLogFile(kind, dateStamp, bytesToWrite);
        const stream = fs.createWriteStream(next.filePath, { flags: 'a', encoding: 'utf8' });
        stream.on('error', (error) => {
            originalConsole.error(`[logger] Failed writing ${next.filePath}:`, error);
        });
        state = { ...next, dateStamp, stream, bytes: next.size };
        writerStates.set(kind, state);
        return state;
    } catch (error) {
        fileLoggingAvailable = false;
        originalConsole.error('[logger] Failed to open log file:', error);
        return null;
    }
}

function writeToFile(kind, line) {
    const bytes = Buffer.byteLength(line, 'utf8');
    const state = ensureWriter(kind, bytes);
    if (!state) return;
    state.bytes += bytes;
    state.stream.write(line);
}

function consoleMethodForLevel(level) {
    if (level === 'fatal' || level === 'error') return originalConsole.error;
    if (level === 'warn') return originalConsole.warn;
    if (level === 'debug') return originalConsole.debug;
    return originalConsole.log;
}

function writeToConsole(entry) {
    const method = consoleMethodForLevel(entry.level);
    if (!config.prettyConsole) {
        method(JSON.stringify(entry));
        return;
    }
    const details = [];
    for (const key of ['requestId', 'event', 'method', 'path', 'status', 'durationMs', 'ip', 'userId']) {
        if (entry[key] !== undefined) details.push(`${key}=${entry[key]}`);
    }
    const suffix = details.length ? ` ${details.join(' ')}` : '';
    method(`[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.message}${suffix}`);
    if (entry.error && (entry.level === 'error' || entry.level === 'fatal')) {
        method(entry.error.stack || entry.error.message || util.inspect(entry.error));
    }
}

function shouldLog(level) {
    return LEVELS[level] >= LEVELS[config.level] && config.level !== 'off';
}

function emit(level, message, fields) {
    if (!shouldLog(level)) return;
    const context = contextStorage.getStore() || {};
    const safeFields = sanitize(fields || {});
    const mergedFields = { ...sanitize(context) };
    for (const [key, value] of Object.entries(safeFields)) {
        // An optional per-call field must not erase a value already attached to
        // the request context (notably the UUID learned after login/auth).
        if (value !== undefined) mergedFields[key] = value;
    }
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        service: config.service,
        pid: process.pid,
        ...mergedFields,
        message: redactText(message || '')
    };
    const line = `${JSON.stringify(entry)}\n`;
    if (fileLoggingAvailable) {
        // Keep each entry in exactly one file. Older behavior duplicated every
        // error into both app-* and error-* logs, doubling storage and search
        // results without adding traceability.
        writeToFile(LEVELS[level] >= LEVELS.error ? 'error' : 'app', line);
    }
    if (config.toConsole) writeToConsole(entry);
}

function normalizeFields(fields) {
    if (fields instanceof Error) return { error: fields };
    if (fields && typeof fields === 'object') return fields;
    return fields === undefined ? {} : { value: fields };
}

const logger = {
    debug(message, fields) { emit('debug', message, normalizeFields(fields)); },
    info(message, fields) { emit('info', message, normalizeFields(fields)); },
    warn(message, fields) { emit('warn', message, normalizeFields(fields)); },
    error(message, fields) { emit('error', message, normalizeFields(fields)); },
    fatal(message, fields) { emit('fatal', message, normalizeFields(fields)); },
    runWithContext(context, callback) {
        return contextStorage.run(sanitize(context || {}), callback);
    },
    addContext(fields) {
        const store = contextStorage.getStore();
        if (!store || !fields || typeof fields !== 'object') return;
        const safeFields = sanitize(fields);
        for (const [key, value] of Object.entries(safeFields)) {
            if (value === undefined) delete store[key];
            else store[key] = value;
        }
    },
    getContext() {
        return { ...(contextStorage.getStore() || {}) };
    },
    installConsoleBridge() {
        if (consoleBridgeInstalled) return;
        consoleBridgeInstalled = true;
        const bridge = (level) => (...args) => {
            const message = util.formatWithOptions({ colors: false, depth: 4, maxArrayLength: 30 }, ...args);
            emit(level, message, { event: 'console' });
        };
        console.debug = bridge('debug');
        console.info = bridge('info');
        console.log = bridge('info');
        console.warn = bridge('warn');
        console.error = bridge('error');
    },
    installProcessHandlers() {
        if (processHandlersInstalled) return;
        processHandlersInstalled = true;
        const fatalExit = (message, details) => {
            if (fatalShutdownStarted) return;
            fatalShutdownStarted = true;
            emit('fatal', message, details);
            const forceExit = setTimeout(() => process.exit(1), 1000);
            logger.flush().finally(() => {
                clearTimeout(forceExit);
                process.exit(1);
            });
        };
        process.on('uncaughtException', (error, origin) => {
            fatalExit('Uncaught exception', { event: 'process.uncaught_exception', origin, error });
        });
        process.on('unhandledRejection', (reason) => {
            const error = reason instanceof Error ? reason : new Error(util.format(reason));
            fatalExit('Unhandled promise rejection', { event: 'process.unhandled_rejection', error });
        });
    },
    flush() {
        const pending = [];
        for (const state of writerStates.values()) {
            if (!state.stream) continue;
            pending.push(new Promise((resolve) => state.stream.end(resolve)));
            state.stream = null;
        }
        writerStates.clear();
        return Promise.allSettled(pending);
    },
    config: { ...config }
};

cleanupOldLogs();

module.exports = logger;
