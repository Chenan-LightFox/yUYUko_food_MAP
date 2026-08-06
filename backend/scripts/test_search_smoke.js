const express = require('express');
const assert = require('assert/strict');
const { db, init } = require('../db');
process.env.SILICONFLOW_API_KEY = '';
process.env.DEEPSEEK_API_KEY = '';
const searchRouter = require('../routes/search');
const {
    rankSemanticRows,
    reasonMatchesPlace,
    buildEmbeddingQuery,
    placeDetailCompleteness
} = require('../services/semanticSearch');
const { parseIntentExpansionContent, parseYuyukoReasonsContent } = require('../services/aiClients');

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
        const rankedInsideView = rankSemanticRows([
            { id: 4, name: '屏幕中心普通匹配', latitude: 23.1291, longitude: 113.2644, vector_distance: 0.16 },
            { id: 5, name: '屏幕边缘精准匹配', latitude: 23.155, longitude: 113.295, vector_distance: 0.05 }
        ], {
            center: { lat: 23.1291, lng: 113.2644 },
            bounds: { minLat: 23.1, minLng: 113.23, maxLat: 23.16, maxLng: 113.3 },
            limit: 5
        });
        assert.equal(rankedInsideView[0]?.place?.id, 5, 'distance inside the viewport must not override semantic relevance');
        assert.ok(rankedInsideView[0]?.score < rankedInsideView[0]?.semantic_score, 'sparse details should reduce recommendation weight');
        assert.equal(placeDetailCompleteness({ name: '森焱食馆', category: '其他', description: '', per_person_cost: null }), 0);
        assert.equal(placeDetailCompleteness({
            name: '资料完整地点',
            category: '印度菜',
            description: '这是一段超过八十字的详细介绍，包含餐厅的招牌风味、用餐环境、适合人群、营业时段和实际体验等有效信息，用于帮助用户理解这家店为什么符合当前搜索需求，而不是只有一个没有上下文的店名。',
            per_person_cost: 68
        }), 1);
        const detailWeighted = rankSemanticRows([
            { id: 9, name: '高语义但资料空白', category: '其他', description: '', per_person_cost: null, latitude: 23.1291, longitude: 113.2644, vector_distance: 0.03 },
            { id: 10, name: '资料完整且相关', category: '印度菜', description: '提供详细菜系、招牌风味、用餐环境和适合人群的信息，内容足以支撑推荐理由，并帮助用户判断是否符合当前需求。这家店还有清晰的人均价格和具体分类，不需要模型凭空猜测。', per_person_cost: 68, latitude: 23.13, longitude: 113.265, vector_distance: 0.16 }
        ], {
            center: { lat: 23.1291, lng: 113.2644 },
            bounds: { minLat: 23.1, minLng: 113.23, maxLat: 23.16, maxLng: 113.3 },
            limit: 5
        });
        assert.equal(detailWeighted[0]?.place?.id, 10, 'complete details should outweigh a slightly higher but unsupported semantic match');
        const rankedWithoutWarnings = rankSemanticRows([
            { id: 7, name: '高匹配避雷地点', category: '印度菜, 避雷', latitude: 23.1291, longitude: 113.2644, vector_distance: 0.01 },
            { id: 8, name: '正常推荐地点', category: '印度菜', latitude: 23.13, longitude: 113.265, vector_distance: 0.12 }
        ], {
            center: { lat: 23.1291, lng: 113.2644 },
            bounds: { minLat: 23.1, minLng: 113.23, maxLat: 23.16, maxLng: 113.3 },
            limit: 5
        });
        assert.equal(rankedWithoutWarnings[0]?.place?.id, 8, '避雷地点 must never enter AI recommendations');
        assert.equal(rankedWithoutWarnings.some((match) => match.place.id === 7), false);
        const parsedExpansion = parseIntentExpansionContent(
            '```json\n{"needs_expansion":true,"retrieval_text":"菜品摆盘精致、适合拍照且用餐环境有氛围感"}\n```',
            '想吃一顿漂亮饭'
        );
        const prettyMealProfile = buildEmbeddingQuery('想吃一顿漂亮饭', parsedExpansion);
        assert.equal(prettyMealProfile.expanded, true, 'a DeepSeek-classified implicit intent should be expanded');
        assert.match(prettyMealProfile.text, /摆盘精致/);
        assert.equal(prettyMealProfile.minimumSemanticScore, 0.55);
        const parsedLiteral = parseIntentExpansionContent(
            '{"needs_expansion":false,"retrieval_text":"印度菜"}',
            '印度菜'
        );
        const normalProfile = buildEmbeddingQuery('印度菜', parsedLiteral);
        assert.equal(normalProfile.expanded, false, 'a DeepSeek-classified literal query should keep the normal threshold');
        const malformedExpansion = parseIntentExpansionContent('not json', '随便吃点');
        assert.deepEqual(malformedExpansion, {
            needs_expansion: false,
            retrieval_text: '随便吃点',
            source: 'original'
        }, 'malformed DeepSeek output should fall back to the original query');
        const expandedIntentMatch = rankSemanticRows([
            { id: 6, name: '适合拍照的精致餐厅', latitude: 23.1291, longitude: 113.2644, vector_distance: 0.44 }
        ], {
            center: { lat: 23.1291, lng: 113.2644 },
            bounds: { minLat: 23.1, minLng: 113.23, maxLat: 23.16, maxLng: 113.3 },
            limit: 5,
            minimumSemanticScore: prettyMealProfile.minimumSemanticScore
        });
        assert.equal(expandedIntentMatch[0]?.place?.id, 6, 'expanded slang intent should allow a moderately similar relevant place');
        const irrelevant = rankSemanticRows([
            { id: 3, name: '附近但不相关地点', latitude: 23.1291, longitude: 113.2644, vector_distance: 0.5 }
        ], {
            center: { lat: 23.1291, lng: 113.2644 },
            bounds: { minLat: 23.1, minLng: 113.23, maxLat: 23.16, maxLng: 113.3 },
            limit: 5
        });
        assert.equal(irrelevant.length, 0, 'distance must not rescue a semantically irrelevant place');
        assert.equal(reasonMatchesPlace('推荐 Little PaPa 印度餐厅', '森焱食馆'), false, 'a reason for another shop must be rejected');
        assert.equal(reasonMatchesPlace('森焱食馆不如 Little PaPa', '森焱食馆', ['Little PaPa']), false, 'a reason mentioning another candidate must be rejected');
        assert.equal(reasonMatchesPlace('森焱食馆就在附近', '森焱食馆'), true, 'a reason naming the selected shop should pass');
        const batchMatches = [
            { place: { name: '第一家' } },
            { place: { name: '第二家' } },
            { place: { name: '第三家' } }
        ];
        const batchReasons = parseYuyukoReasonsContent(JSON.stringify({
            recommendations: [
                { name: '第二家', reason: '第二家适合想吃清淡口味的时候。' },
                { name: '第一家', reason: '第一家和你的需求最贴近。' }
            ]
        }), batchMatches);
        assert.deepEqual(batchReasons, [
            '第一家和你的需求最贴近。',
            '第二家适合想吃清淡口味的时候。',
            ''
        ], 'batch reasons should map to exact place names and preserve ranking order');

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
        if (![200, 503].includes(aiResponse.status)
            || !Object.prototype.hasOwnProperty.call(aiBody, 'recommendation')
            || !Array.isArray(aiBody.recommendations)) {
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
