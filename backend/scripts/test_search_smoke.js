const express = require('express');
const assert = require('assert/strict');
const { db, init } = require('../db');
process.env.SILICONFLOW_API_KEY = '';
process.env.DEEPSEEK_API_KEY = '';
const searchRouter = require('../routes/search');
const { rankSemanticRows } = require('../services/semanticSearch');

async function main() {
    init();
    db._raw.exec('BEGIN');
    db._raw.prepare(`INSERT INTO Place (name, category, description, latitude, longitude)
                     VALUES (?, ?, ?, ?, ?)`)
        .run('搜索烟测地点', '测试分类', '包含双轨烟测关键词', 23.1291, 113.2644);
    const app = express();
    app.use(express.json());
    app.use('/api', searchRouter);

    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
        const address = server.address();
        const baseUrl = `http://127.0.0.1:${address.port}`;
        const fastResponse = await fetch(`${baseUrl}/api/places/search/fast?q=${encodeURIComponent('双轨烟测关键词')}&lat=23.1291&lng=113.2644`);
        const fastBody = await fastResponse.json();
        if (!fastResponse.ok || !Array.isArray(fastBody) || !fastBody.some((place) => place.name === '搜索烟测地点')) {
            throw new Error('fast search did not match the fixture description');
        }
        const smokePlace = fastBody.find((place) => place.name === '搜索烟测地点');
        assert.equal(smokePlace.distance_km, 0, 'fast search should include distance from map center');

        const ranked = rankSemanticRows([
            { id: 1, name: '远处高语义地点', latitude: 39.9042, longitude: 116.4074, vector_distance: 0.02 },
            { id: 2, name: '附近匹配地点', latitude: 23.1301, longitude: 113.2654, vector_distance: 0.18 }
        ], {
            center: { lat: 23.1291, lng: 113.2644 },
            bounds: { minLat: 23.1, minLng: 113.23, maxLat: 23.16, maxLng: 113.3 },
            limit: 5
        });
        assert.equal(ranked[0]?.place?.id, 2, 'nearby semantic result should outrank a remote city');
        assert.equal(ranked.some((match) => match.place.id === 1), false, 'remote candidates should be excluded');

        const aiResponse = await fetch(`${baseUrl}/api/places/search/ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                q: '想吃新鲜的鱼粥',
                center: { lat: 23.1291, lng: 113.2644 },
                bounds: { minLat: 23.1, minLng: 113.23, maxLat: 23.16, maxLng: 113.3 }
            })
        });
        const aiBody = await aiResponse.json();
        if (![200, 503].includes(aiResponse.status) || !Object.prototype.hasOwnProperty.call(aiBody, 'recommendation')) {
            throw new Error('AI search returned an invalid response shape');
        }
        console.log(JSON.stringify({
            fastStatus: fastResponse.status,
            fastResultCount: fastBody.length,
            aiStatus: aiResponse.status,
            aiMode: aiBody.status
        }));
    } finally {
        await new Promise((resolve) => server.close(resolve));
        db._raw.exec('ROLLBACK');
        db.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
