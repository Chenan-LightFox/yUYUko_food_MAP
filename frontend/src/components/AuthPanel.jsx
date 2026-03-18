import React from 'react';
import Button from './Button';

export default function AuthPanel({ user, isAuth, isAdmin, onLogout, onOpenAuth, onOpenAdmin }) {
    return (
        <div className="panel" style={{ position: "absolute", left: 12, top: 12, zIndex: 4000, padding: 8, background: "#fff", borderRadius: 6 }}>
            <strong>东方饭联地图</strong>
            <div style={{ marginTop: 8 }}>
                {isAuth ? (
                    <div>
                        当前用户：{user.username} <Button onClick={onLogout}>注销</Button>
                        {isAdmin && <Button style={{ marginLeft: 8 }} onClick={onOpenAdmin}>进入管理员后台</Button>}
                    </div>
                ) : (
                    <div>
                        未登录 <Button onClick={onOpenAuth}>登录 / 注册</Button>
                    </div>
                )}
            </div>
        </div>
    );
}
