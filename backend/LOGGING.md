# 后端日志使用说明

后端启动后会同时输出可读控制台日志，并在 `backend/logs/` 写入 JSON Lines 文件：

- `app-YYYY-MM-DD.log`：全部应用、请求和安全事件。
- `error-YYYY-MM-DD.log`：仅 `error` 与 `fatal` 事件。
- 文件达到 `LOG_MAX_FILE_MB` 后生成 `.1.log`、`.2.log`；超过保留天数的文件会在下次启动时清理。

每个 HTTP 请求都会获得 `X-Request-ID`。错误 JSON 也包含 `requestId`，登录和注册界面会直接显示该编号。拿到编号后可运行：

```powershell
cd backend
npm run logs -- --request-id "请求编号" --since 2h
```

常用命令：

```powershell
# 最近两小时的警告、错误与致命日志
npm run logs -- --since 2h --level warn

# 最近七天的登录事件
npm run logs -- --since 7d --event auth.login

# 最近一天最多 200 条错误，输出原始 JSON
npm run logs -- --level error --limit 200 --json
```

## 记录内容

- 请求开始、完成、耗时、状态码、来源、IP、User-Agent、响应错误摘要。
- 登录、注册、退出、鉴权拒绝、Redis 会话故障和 CORS 拒绝。
- 所有既有 `console.log/warn/error`、未捕获异常和未处理 Promise 拒绝。
- 提前断开的连接以及超过 `LOG_SLOW_REQUEST_MS` 的慢请求。
- SQLite 查询错误、超过 `DB_SLOW_QUERY_MS` 的慢查询，以及高德代理故障。
- 登录前端阶段事件 `auth.client.stage`，可判断浏览器卡在响应接收、载荷解析还是 React 状态提交。

密码、JWT、Authorization、Cookie、邀请码、API Key 和头像二进制字段会被自动脱敏。请求正文不会写入访问日志。

## 环境变量

配置示例位于 `.env.example`。生产环境建议至少设置：

```dotenv
LOG_LEVEL=info
LOG_DIR=logs
LOG_TO_FILE=true
LOG_TO_CONSOLE=true
LOG_MAX_FILE_MB=20
LOG_RETENTION_DAYS=14
LOG_SLOW_REQUEST_MS=1500
DB_SLOW_QUERY_MS=100
LOG_NOISY_PATH_PREFIXES=/_AMapService,/uploads
```

高德瓦片和上传静态文件的正常请求默认不逐条记录，以免日志快速膨胀；它们的失败、慢请求和异常仍会记录。
