const express = require('express');
const { db, init } = require('../db');
process.env.SILICONFLOW_API_KEY = '';
process.env.DEEPSEEK_API_KEY = '';
const searchRouter = require('../routes/search');

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
        const fastResponse = await fetch(`${baseUrl}/api/places/search/fast?q=${encodeURIComponent('双轨烟测关键词')}`);
        const fastBody = await fastResponse.json();
        if (!fastResponse.ok || !Array.isArray(fastBody) || !fastBody.some((place) => place.name === '搜索烟测地点')) {
            throw new Error('fast search did not match the fixture description');
        }

        const aiResponse = await fetch(`${baseUrl}/api/places/search/ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: '想吃新鲜的鱼粥' })
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
