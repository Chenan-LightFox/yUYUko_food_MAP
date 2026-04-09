import React, { createContext, useContext, useState, useCallback } from 'react';
import Button from './Button';
import useDarkMode from '../utils/useDarkMode';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
    const [confirmState, setConfirmState] = useState(null);

    const confirm = useCallback((message) => {
        return new Promise((resolve) => {
            setConfirmState({
                message,
                onConfirm: () => {
                    setConfirmState(null);
                    resolve(true);
                },
                onCancel: () => {
                    setConfirmState(null);
                    resolve(false);
                }
            });
        });
    }, []);

    const dark = useDarkMode();

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {confirmState && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: dark ? '#1e293b' : '#fff',
                        padding: 24, borderRadius: 8, maxWidth: 400, width: '90%',
                        color: dark ? '#e2e8f0' : '#333',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
                    }}>
                        <div style={{ fontSize: 16, marginBottom: 24 }}>{confirmState.message}</div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                            <Button themeAware onClick={confirmState.onCancel}>取消</Button>
                            <Button themeAware style={{ background: '#ef4444', color: '#fff' }} onClick={confirmState.onConfirm}>确认</Button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    return useContext(ConfirmContext);
}
