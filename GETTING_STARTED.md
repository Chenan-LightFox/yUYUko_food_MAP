# 快速上手（给完全初学者）

> 本项目分为 **前端**（`frontend/`）和 **后端**（`backend/`）两个部分，各自独立运行。  
> 首次运行请按顺序完成以下步骤。

---

## 0-1. 安装 Node.js / npm

npm 是 Node.js 自带的包管理工具，安装 Node.js 后自动附带。

1. 根据系统下载安装：
   - **macOS**：打开 https://nodejs.org，下载 `.pkg`（LTS 版），双击安装
   - **Windows**：参考视频教程 👉 [BV1sK41187iw](https://www.bilibili.com/video/BV1sK41187iw)
2. 安装完成后验证（macOS 用「终端 Terminal」，Windows 用「命令提示符 CMD」或「PowerShell」）：

```bash
node -v   # 应输出类似 v20.x.x
npm -v    # 应输出类似 10.x.x
```

---

## 0-2. 启动 Redis（后端依赖）

后端使用 Redis 存储登录会话，需要本地先运行 Redis。

**macOS（推荐用 Homebrew）：**

```bash
# 若未安装 Homebrew，先在终端执行：
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install redis
brew services start redis   # 后台常驻运行
```

**Windows：**

推荐使用 [Memurai](https://www.memurai.com/)（Redis 的 Windows 原生版，免费开发版）：

1. 前往 https://www.memurai.com/get-memurai 下载安装包
2. 双击安装，安装后会自动作为 Windows 服务在后台运行
3. 或者使用 WSL2（Windows Subsystem for Linux）并在其中按 macOS 方式安装 Redis

**验证（两平台通用）：**

```bash
redis-cli ping   # 应输出 PONG
```

> **Windows CMD / PowerShell** 中 `redis-cli` 需要在 Memurai 安装目录下执行，或将其加入系统 PATH。

---

## 0-3. 安装后端依赖并启动

**macOS 终端 / Windows PowerShell / CMD 通用：**

```bash
cd backend
npm install       # 安装所有依赖（只需首次或依赖变更时执行）
npm start         # 启动后端服务，默认监听 http://localhost:3000
```

> **Windows 用户**：推荐使用 **PowerShell** 或 **Windows Terminal**，避免使用老版 CMD（部分颜色输出可能乱码，但不影响运行）。

---

## 0-4. 安装前端依赖并启动

新开一个终端窗口/标签页：

**macOS 终端 / Windows PowerShell / CMD 通用：**

```bash
cd frontend
npm install       # 安装所有依赖（只需首次或依赖变更时执行）
npm run dev       # 启动前端开发服务器，默认地址见终端输出（通常为 http://localhost:5173）
```

> `npm run dev` 启动的是 **Vite 开发服务器**，支持热更新，修改代码后浏览器自动刷新。  
> 启动后在浏览器打开终端输出的地址（如 `http://localhost:5173`）即可看到页面。

---

## 常用命令速查

| 位置 | 命令 | 作用 |
|------|------|------|
| `backend/` | `npm install` | 安装/更新后端依赖 |
| `backend/` | `npm start` | 启动后端（生产/调试） |
| `frontend/` | `npm install` | 安装/更新前端依赖 |
| `frontend/` | `npm run dev` | 启动前端开发服务器 |
| `frontend/` | `npm run build` | 打包前端（生产部署用） |
