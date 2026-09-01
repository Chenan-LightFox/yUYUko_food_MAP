const Redis = require("ioredis");
const logger = require('./utils/logger');

const redis = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    // 断线自动重连配置
    retryStrategy(times) {
        // 最多重试 20 次
        if (times > 20) {
            logger.error('Redis reconnect limit reached', {
                event: 'redis.reconnect_exhausted',
                attempts: times
            });
            return null; // 停止重试
        }
        // 重试间隔: min(times * 500ms, 10s)
        const delay = Math.min(times * 500, 10000);
        return delay;
    },
    // 连接超时
    connectTimeout: 10000,
    // 命令超时（避免在有问题的连接上无限等待）
    commandTimeout: 8000,
    // 当连接断开时是否让命令失败而不是排队等待
    enableOfflineQueue: true,
    // 最大重连间隔
    maxRetriesPerRequest: 3,
    // 自动重连
    autoResubscribe: true,
    // lazyConnect 保持 false，启动时即连接
    lazyConnect: false,
});

let redisReady = false;

redis.on("connect", () => {
    logger.debug('Redis connection established', { event: 'redis.connected' });
});

redis.on("ready", () => {
    redisReady = true;
    logger.info('Redis ready', { event: 'redis.ready' });
});

redis.on("error", (err) => {
    logger.error('Redis error', { event: 'redis.error', error: err });
    // ioredis 会自动尝试重连，这里只记录日志
});

redis.on("close", () => {
    redisReady = false;
    logger.warn('Redis connection closed', { event: 'redis.closed' });
});

redis.on("reconnecting", (ms) => {
    redisReady = false;
    logger.warn('Redis reconnect scheduled', {
        event: 'redis.reconnecting',
        delayMs: ms
    });
});

// 暴露一个健康检查方法供外部使用
redis.isReady = () => redisReady;

module.exports = redis;
