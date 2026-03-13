import React, { useEffect, useState } from "react";

export default function AdminUsers({ backendUrl, token, user }) {
    const [users, setUsers] = useState([]);
    const [message, setMessage] = useState("");
    const isY = user && user.admin_level === "YUYUKO";

    useEffect(() => {
        if (isY) {
            fetch(`${backendUrl}/admin/users`, {
                headers: { Authorization: `Bearer ${token}` }
            })
                .then(res => res.json())
                .then(data => {
                    if (data.error) setMessage(data.error);
                    else setUsers(data);
                })
                .catch(e => setMessage("加载失败：" + e.message));
        }
    }, [isY, backendUrl, token]);

    // 更改等级操作
    const changeLevel = (userId, newLevel) => {
        fetch(`${backendUrl}/admin/users/set-level`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ userId, admin_level: newLevel })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setMessage("权限已更新");
                    setUsers(users =>
                        users.map(u =>
                            u.id === userId ? { ...u, admin_level: newLevel || null } : u
                        )
                    );
                } else setMessage(data.error || "更新失败");
            })
            .catch(e => setMessage("失败：" + e.message));
    };

    // 删除用户操作
    const deleteUser = (id) => {
        if (!window.confirm("确认删除此用户？")) return;
        fetch(`${backendUrl}/admin/users/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setMessage("用户已删除");
                    setUsers(users => users.filter(u => u.id !== id));
                } else setMessage(data.error || "删除失败");
            })
            .catch(e => setMessage("失败：" + e.message));
    };

    if (!isY) return <div>您的权限等级不足，无法进行此操作～</div>;
    return (
        <div>
            <h2>用户管理</h2>
            {message && <div style={{ color: "red" }}>{message}</div>}
            <table border="1" cellPadding="8">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>用户名</th>
                        <th>头像</th>
                        <th>等级</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(u => {
                        const isSelf = user && u.id === user.id;
                        const isSuper = u.admin_level === "YUYUKO";
                        return (
                            <tr key={u.id}>
                                <td>{u.id}</td>
                                <td>{u.username}</td>
                                <td>{u.avatar || "-"}</td>
                                <td>
                                    <select value={u.admin_level || ""}
                                        onChange={e => changeLevel(u.id, e.target.value)}
                                        disabled={isSelf || (isSuper && !isSelf)}>
                                        <option value="YUYUKO">YUYUKO</option>
                                        <option value="YOUMU">YOUMU</option>
                                        <option value="EIKI">EIKI</option>
                                        <option value="KOMACHI">KOMACHI</option>
                                        <option value="">普通用户</option>
                                    </select>
                                </td>
                                <td>
                                    <button onClick={() => deleteUser(u.id)} disabled={isSelf || isSuper}>删除</button>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    );
}
