const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const BACKEND_DIR = path.resolve(__dirname, '..');
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };

function getArg(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name) {
    return process.argv.includes(name);
}

function parseLimit(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.min(2000, Math.max(1, parsed)) : 100;
}

function parseSince(value) {
    if (!value) return Date.now() - 24 * 60 * 60 * 1000;
    const duration = String(value).trim().match(/^(\d+)(m|h|d)$/i);
    if (duration) {
        const unitMs = { m: 60000, h: 3600000, d: 86400000 }[duration[2].toLowerCase()];
        return Date.now() - Number(duration[1]) * unitMs;
    }
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
        throw new Error(`无法识别 --since ${value}，请使用 30m、2h、7d 或 ISO 时间`);
    }
    return timestamp;
}

function resolveLogDirectory() {
    const configured = process.env.LOG_DIR;
    if (!configured) return path.join(BACKEND_DIR, 'logs');
    return path.isAbsolute(configured) ? configured : path.resolve(BACKEND_DIR, configured);
}

function formatEntry(entry) {
    const parts = [
        entry.timestamp,
        String(entry.level || 'info').toUpperCase().padEnd(5),
        entry.requestId ? `[${entry.requestId}]` : '',
        entry.method || '',
        entry.path || '',
        entry.status !== undefined ? `status=${entry.status}` : '',
        entry.durationMs !== undefined ? `${entry.durationMs}ms` : '',
        entry.ip ? `ip=${entry.ip}` : '',
        entry.userId ? `user=${entry.userId}` : '',
        entry.event ? `event=${entry.event}` : '',
        entry.stage ? `stage=${entry.stage}` : '',
        entry.detail ? `detail=${JSON.stringify(entry.detail)}` : '',
        entry.message || ''
    ].filter(Boolean);
    if (entry.responseError) parts.push(`responseError=${JSON.stringify(entry.responseError)}`);
    if (entry.error) parts.push(`error=${entry.error.stack || entry.error.message || JSON.stringify(entry.error)}`);
    return parts.join(' ');
}

function printUsage() {
    console.log(`用法：npm run logs -- [选项]

选项：
  --since 2h            时间范围：30m、2h、7d 或 ISO 时间（默认 24h）
  --level warn          最低级别：debug/info/warn/error/fatal
  --request-id ID       按请求编号精确检索
  --ip ADDRESS          按客户端 IP 精确检索
  --user-id UUID        按用户 UUID 精确检索
  --event TEXT          按事件名包含匹配
  --limit 100           最多输出条数（1-2000）
  --json                输出原始 JSON
  --help                显示帮助`);
}

function main() {
    if (hasArg('--help')) {
        printUsage();
        return;
    }

    const logDirectory = resolveLogDirectory();
    const since = parseSince(getArg('--since'));
    const limit = parseLimit(getArg('--limit'));
    const requestedLevel = String(getArg('--level') || 'debug').toLowerCase();
    const minimumLevel = LEVELS[requestedLevel];
    if (minimumLevel === undefined) throw new Error(`未知日志级别：${requestedLevel}`);
    const requestId = getArg('--request-id');
    const ipFilter = getArg('--ip');
    const userIdFilter = getArg('--user-id');
    const eventFilter = getArg('--event');
    const outputJson = hasArg('--json');

    if (!fs.existsSync(logDirectory)) {
        console.log(`日志目录尚不存在：${logDirectory}`);
        return;
    }

    const files = fs.readdirSync(logDirectory)
        .filter((name) => /^(app|error)-\d{4}-\d{2}-\d{2}(?:\.\d+)?\.log$/.test(name))
        .map((name) => ({ name, mtimeMs: fs.statSync(path.join(logDirectory, name)).mtimeMs }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .map((item) => item.name);
    const matches = [];
    const seenLines = new Set();

    for (const file of files) {
        const lines = fs.readFileSync(path.join(logDirectory, file), 'utf8').split(/\r?\n/).filter(Boolean).reverse();
        for (const line of lines) {
            // Old logger versions duplicated errors into app-* and error-*.
            if (seenLines.has(line)) continue;
            seenLines.add(line);
            let entry;
            try {
                entry = JSON.parse(line);
            } catch (error) {
                continue;
            }
            const timestamp = Date.parse(entry.timestamp);
            if (Number.isFinite(timestamp) && timestamp < since) continue;
            if ((LEVELS[entry.level] || 0) < minimumLevel) continue;
            if (requestId && entry.requestId !== requestId) continue;
            if (ipFilter && entry.ip !== ipFilter) continue;
            if (userIdFilter && entry.userId !== userIdFilter) continue;
            if (eventFilter && !String(entry.event || '').includes(eventFilter)) continue;
            matches.push(entry);
        }
    }

    const selected = matches
        .sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0))
        .slice(0, limit)
        .reverse();
    selected.forEach((entry) => {
        console.log(outputJson ? JSON.stringify(entry) : formatEntry(entry));
    });
    if (!selected.length) console.log('没有找到符合条件的日志。');
}

try {
    main();
} catch (error) {
    console.error(`读取日志失败：${error.message}`);
    process.exitCode = 1;
}
