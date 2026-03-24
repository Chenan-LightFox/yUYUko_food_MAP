const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { init } = require("./db");

const placesRouter = require("./routes/places");
const commentsRouter = require("./routes/comments");
const usersRouter = require("./routes/users");
const searchRouter = require('./routes/search');
const adminUsersRouter = require("./routes/admin/adminUsers");


const app = express();
const HOST = "localhost";
const PORT = process.env.PORT || 3000; // 使用 3000（可被环境覆盖）

const ALLOWED_ORIGINS = [
    "http://8.210.201.2",
    "http://8.210.201.2:3000",
    "http://localhost:3000",
    "http://localhost:5173"
];

app.use((req, res, next) => {
    const origin = req.headers.origin;

    // 检查请求来源是否在白名单中
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Max-Age', '3600');
    }

    // 处理预检请求
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    next();
});

app.options("*");

app.use(bodyParser.json());
app.use("/admin/users", adminUsersRouter);


init();

app.use('/api', searchRouter);
app.use("/places", placesRouter);
app.use("/comments", commentsRouter);
app.use("/users", usersRouter);

app.get("/", (req, res) => res.json({ ok: true, msg: "yUYUko Food Map Backend" }));

app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
});
