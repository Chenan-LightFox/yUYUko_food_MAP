const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { init } = require("./db");

const placesRouter = require("./routes/places");
const commentsRouter = require("./routes/comments");
const usersRouter = require("./routes/users");

const app = express();
const PORT = 3000; // ºó¶Ë¼àÌý¶Ë¿Ú

app.use(cors());
app.use(bodyParser.json());

init();

app.use("/places", placesRouter);
app.use("/comments", commentsRouter);
app.use("/users", usersRouter);

app.get("/", (req, res) => res.json({ ok: true, msg: "yUYUko Food Map Backend" }));

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});