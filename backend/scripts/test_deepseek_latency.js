const https = require('https');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DEFAULT_RUNS = 5;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MODEL = 'deepseek-v4-flash';

function parseArgs(argv) {
    const args = { runs: DEFAULT_RUNS, timeoutMs: DEFAULT_TIMEOUT_MS };
    for (let i = 0; i < argv.length; i += 1) {
        const key = argv[i];
        if (key === '--runs' && argv[i + 1]) {
            args.runs = Number(argv[i + 1]);
            i += 1;
        } else if (key === '--timeout' && argv[i + 1]) {
            args.timeoutMs = Number(argv[i + 1]);
            i += 1;
        }
    }
    if (!Number.isFinite(args.runs) || args.runs <= 0) args.runs = DEFAULT_RUNS;
    if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) args.timeoutMs = DEFAULT_TIMEOUT_MS;
    return args;
}

function postJson(url, payload, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const body = JSON.stringify(payload);
        const req = https.request({
            method: 'POST',
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: `${urlObj.pathname}${urlObj.search}`,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                ...headers
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({ status: res.statusCode || 0, body: data });
            });
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('DeepSeek request timed out'));
        });
        req.write(body);
        req.end();
    });
}

function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[idx];
}

async function main() {
    const { runs, timeoutMs } = parseArgs(process.argv.slice(2));
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
    const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;

    if (!apiKey) {
        console.error('DEEPSEEK_API_KEY is missing. Set it in backend/.env first.');
        process.exit(1);
    }

    const url = `${baseUrl}/v1/chat/completions`;
    const payload = {
        model,
        temperature: 0,
        max_tokens: 32,
        messages: [
            { role: 'system', content: 'Return one short word.' },
            { role: 'user', content: 'Ping' }
        ]
    };

    const durations = [];
    let failures = 0;

    for (let i = 0; i < runs; i += 1) {
        const start = process.hrtime.bigint();
        try {
            const res = await postJson(url, payload, { Authorization: `Bearer ${apiKey}` }, timeoutMs);
            const end = process.hrtime.bigint();
            const ms = Number(end - start) / 1e6;
            if (res.status >= 200 && res.status < 300) {
                durations.push(ms);
                console.log(`Run ${i + 1}/${runs}: ${res.status} ${ms.toFixed(1)} ms`);
            } else {
                failures += 1;
                console.warn(`Run ${i + 1}/${runs}: ${res.status} (failed)`);
            }
        } catch (err) {
            failures += 1;
            console.warn(`Run ${i + 1}/${runs}: ${err.message || err}`);
        }
    }

    if (!durations.length) {
        console.error('All requests failed.');
        process.exit(1);
    }

    const avg = durations.reduce((sum, v) => sum + v, 0) / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const p95 = percentile(durations, 95);

    console.log('---');
    console.log(`Success: ${durations.length}/${runs}, Failures: ${failures}`);
    console.log(`Avg: ${avg.toFixed(1)} ms, Min: ${min.toFixed(1)} ms, Max: ${max.toFixed(1)} ms, P95: ${p95.toFixed(1)} ms`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
