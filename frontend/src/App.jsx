import React, { useState } from "react";
import MapView from "./Map";

const PORT = (typeof process !== "undefined" && process.env && process.env.REACT_APP_PORT) || 3000;
console.log("REACT_APP_PORT =", typeof process !== "undefined" ? process.env.REACT_APP_PORT : undefined, "→ 使用 PORT =", PORT);

const BACKEND_URL = `http://localhost:${PORT}`;

export default function App() {
    const [userId] = useState(864); // 临时模拟当前用户 id
    return (
        <div style={{ height: "100vh", position: "relative" }}>
            <div className="panel">
                <strong>东方饭联地图</strong>
                <div>当前用户ID: {userId}</div>
            </div>
            <MapView userId={userId} backendUrl={BACKEND_URL} />
        </div>
    );
}
