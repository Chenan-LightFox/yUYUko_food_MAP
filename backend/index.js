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

// 明确配置 CORS，允许前端 origin（示例加入你的前端域名）并处理 preflight
const corsOptions = {
    origin: [
        "http://8.210.201.2",
        "http://8.210.201.2:3000"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // 显式响应 preflight OPTIONS 请求

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
