const Redis = require("ioredis");

const redis = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
});

redis.on("connect", () => console.log("Redis 已连接"));
redis.on("error", (err) => console.error("Redis 错误:", err));

module.exports = redis;
