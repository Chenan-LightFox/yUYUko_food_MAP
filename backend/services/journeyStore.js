const { randomUUID } = require('crypto');
const { db } = require('../db');
const sql = db._raw;
const now = () => new Date().toISOString();
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function string(value, max = 2000) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function coordinate(value, bound) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || Math.abs(n) > bound) fail('坐标超出范围');
    return n;
}
function date(value) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('日期无效');
    return value;
}
function ownedMedia(userId, ids) {
    if (!Array.isArray(ids) || ids.length > 12) fail('每次最多 12 张图片');
    return [...new Set(ids)].map(id => {
        const row = sql.prepare('SELECT id FROM JourneyMedia WHERE id = ? AND user_id = ?').get(String(id), userId);
        if (!row) fail('图片不存在或无权使用', 404);
        return row.id;
    });
}
function normalizeDocument(input, userId) {
    if (!input || !Array.isArray(input.stops) || input.stops.length > 60) fail('行程最多包含 60 个途经点');
    const start_date = date(input.start_date), end_date = date(input.end_date || start_date);
    if (end_date < start_date) fail('结束日期不能早于开始日期');
    const ids = new Set();
    const stops = input.stops.map(s => {
        if (!s || typeof s !== 'object' || Array.isArray(s)) fail('途经点格式无效');
        const id = /^[a-zA-Z0-9_-]{8,80}$/.test(s.id || '') ? s.id : randomUUID();
        if (ids.has(id)) fail('途经点 ID 重复');
        ids.add(id);
        const lng = coordinate(s.lng, 180), lat = coordinate(s.lat, 90);
        if ((lng === null) !== (lat === null)) fail('请同时填写经纬度');
        if (Array.isArray(s.expenses) && s.expenses.length > 30) fail('每站最多 30 笔支出');
        const expenses = (Array.isArray(s.expenses) ? s.expenses : []).map(e => {
            if (!e || typeof e !== 'object' || e.amount === '') fail('金额无效');
            const amount = Number(e.amount);
            if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) fail('金额无效');
            return { id: string(e.id, 80) || randomUUID(), amount: Math.round(amount * 100) / 100, currency: 'CNY', note: string(e.note, 100) };
        });
        const at = string(s.at, 30);
        if (at && (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(at) || !Number.isFinite(Date.parse(at)) || at.slice(0, 10) < start_date || at.slice(0, 10) > end_date)) fail('途经点时间须在行程日期内');
        if (at) date(at.slice(0,10));
        const candidates = (Array.isArray(s.candidates) ? s.candidates : []).slice(0, 5).filter(c=>c && ['local','amap'].includes(c.source)).map(c=> {
            if(c.source === 'amap' && process.env.AMAP_JOURNAL_STORAGE_ALLOWED !== 'true') return null;
            if(c.source === 'local') {
                const p=Number.isSafeInteger(c.place_id) ? sql.prepare('SELECT id,name,longitude,latitude FROM Place WHERE id=?').get(c.place_id) : null;
                return p ? {id:`local_${p.id}`,place_id:p.id,name:p.name,lng:p.longitude,lat:p.latitude,source:'local',address:'',suggested:c.suggested===true,score:Number.isFinite(c.score)?Math.max(-3,Math.min(3,c.score)):1} : null;
            }
            return {id:string(c.id,100),place_id:null,name:string(c.name,160),lng:coordinate(c.lng,180),lat:coordinate(c.lat,90),source:'amap',address:string(c.address,250),suggested:c.suggested===true,score:Number.isFinite(c.score)?Math.max(-3,Math.min(3,c.score)):1};
        }).filter(c=>c && c.lng!==null && c.lat!==null);
        return { id, name: string(s.name, 160) || '未命名地点', note: string(s.note, 4000), at, candidates,
            mood: string(s.mood, 16), lng, lat, address: string(s.address, 250),
            place_id: Number.isSafeInteger(s.place_id) && sql.prepare('SELECT id FROM Place WHERE id = ?').get(s.place_id) ? s.place_id : null,
            source: ['local', 'manual', 'amap'].includes(s.source) ? s.source : 'manual',
            confirmed: s.confirmed === true, visit_status: ['visited', 'planned', 'unknown'].includes(s.visit_status) ? s.visit_status : 'unknown',
            location_resolution:s.location_resolution==='deferred'?'deferred':'pending',clarification_text:string(s.clarification_text,1000),clarification_city:string(s.clarification_city,50),
            evidence: string(s.evidence, 800), media_ids: ownedMedia(userId, s.media_ids || []), expenses };
    });
    if (stops.some(s => s.source === 'amap') && process.env.AMAP_JOURNAL_STORAGE_ALLOWED !== 'true') fail('尚未配置高德数据存储授权，请使用站内地点或手动标记');
    const document = { title: string(input.title, 120) || '我的行程', start_date, end_date,
        summary: string(input.summary, 5000), stops,
        sources: (Array.isArray(input.sources) ? input.sources : []).slice(0, 20).map(s => ({ id: string(s.id, 80), revision: Number(s.revision) || 1 })) };
    if (Buffer.byteLength(JSON.stringify(document)) > 160000) fail('行程内容过大');
    return document;
}
function getJourney(userId, id) {
    const row = sql.prepare('SELECT * FROM Journey WHERE id = ? AND user_id = ?').get(id, userId);
    if (!row) fail('日记不存在', 404);
    return { id: row.id, revision: row.revision, document: JSON.parse(row.document), created_at: row.created_at, updated_at: row.updated_at };
}
function saveJourney(userId, input, id = null, baseRevision = null) {
    const document = normalizeDocument(input, userId);
    return sql.transaction(() => {
        let revision = 1, previousDocument = null;
        if (id) {
            const previous = getJourney(userId, id);
            if (baseRevision !== previous.revision) fail('日记已在其他窗口修改，请重新载入后再保存', 409);
            revision = previous.revision + 1;
            previousDocument = previous.document;
            // Provenance is server-owned. Editing cannot invent merge ancestry.
            document.sources = previous.document.sources;
        } else {
            if (sql.prepare('SELECT COUNT(*) AS n FROM Journey WHERE user_id=?').get(userId).n >= 500) fail('最多保存 500 篇日记，请先整理归档',413);
            id = randomUUID(); document.sources = [];
        }
        const encoded = JSON.stringify(document), time = now();
        if (revision === 1) sql.prepare('INSERT INTO Journey(id,user_id,document,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,userId,encoded,time,time);
        else sql.prepare('UPDATE Journey SET document=?,revision=?,updated_at=? WHERE id=?').run(encoded,revision,time,id);
        sql.prepare('INSERT INTO JourneyRevision VALUES(?,?,?,?)').run(id,revision,encoded,time);
        require('./journeyCorrections').recordSavedChanges(sql,id,revision,previousDocument,document,input,time);
        return getJourney(userId,id);
    })();
}
function mergeJourneys(...args) { return require('./journeyMerge').mergeJourneys(...args); }
module.exports = { sql, now, fail, string, date, coordinate, ownedMedia, normalizeDocument, getJourney, saveJourney, mergeJourneys };
