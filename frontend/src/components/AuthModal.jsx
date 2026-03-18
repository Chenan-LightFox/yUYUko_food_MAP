import React from 'react';
import AuthPage from '../AuthPage';

export default function AuthModal({ backendUrl, onLoginSuccess, onClose }) {
    return (
        <div style={{
            position: "absolute",
            left: 0, top: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5000
        }}>
            <AuthPage backendUrl={backendUrl} onLoginSuccess={onLoginSuccess} onClose={onClose} />
        </div>
    );
}
