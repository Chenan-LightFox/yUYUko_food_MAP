import React from 'react';
import AuthPage from '../AuthPage';
import useDarkMode from '../hooks/useDarkMode';

export default function AuthModal({ backendUrl, onLoginSuccess, onClose }) {
    const dark = useDarkMode();

    const overlayStyle = {
        position: "absolute",
        left: 0, top: 0, right: 0, bottom: 0,
        background: dark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5000
    };

    return (
        <div
            role="presentation"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                    onClose && onClose();
                }
            }}
            style={overlayStyle}
        >
            <AuthPage backendUrl={backendUrl} onLoginSuccess={onLoginSuccess} onClose={onClose} />
        </div>
    );
}
