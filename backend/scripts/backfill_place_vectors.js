const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { db, init, isVectorSearchAvailable } = require('../db');
const { backfillAllPending } = require('../services/placeVectorService');

async function main() {
    init();
    if (!isVectorSearchAvailable()) {
        throw new Error('sqlite-vec 加载失败，请先执行 npm install');
    }
    const rawBatchSize = process.argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1];
    const batchSize = Number.parseInt(rawBatchSize, 10) || Number.parseInt(process.env.VECTOR_BATCH_SIZE, 10) || 20;
    const pending = db._raw.prepare('SELECT COUNT(*) AS count FROM Place WHERE COALESCE(has_vector, 0) = 0').get().count;
    console.log(`待补刷地点：${pending}，批大小：${Math.max(1, Math.min(50, batchSize))}`);
    const result = await backfillAllPending({ batchSize });
    const remaining = db._raw.prepare('SELECT COUNT(*) AS count FROM Place WHERE COALESCE(has_vector, 0) = 0').get().count;
    console.log(`向量补刷完成：成功 ${result.updated}，剩余 ${remaining}`);
    if (remaining > 0) process.exitCode = 2;
}

main()
    .catch((error) => {
        console.error('向量补刷失败：', error.message);
        process.exitCode = 1;
    })
    .finally(() => {
        try { db.close(); } catch (_) { }
    });
