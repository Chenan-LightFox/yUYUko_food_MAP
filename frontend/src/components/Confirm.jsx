import React, { createContext, useContext, useState, useCallback } from 'react';
import Button from './Button';

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

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {confirmState && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'var(--color-backdrop)', zIndex: 10000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: 'var(--color-bg-surface)',
                        padding: 24, borderRadius: 'var(--radius-md)', maxWidth: 400, width: '90%',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        boxShadow: 'var(--shadow-surface)'
                    }}>
                        <div style={{ fontSize: 16, marginBottom: 24 }}>{confirmState.message}</div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                            <Button themeAware onClick={confirmState.onCancel}>取消</Button>
                            <Button themeAware style={{ background: 'var(--color-danger)', color: 'var(--color-on-emphasis)', borderColor: 'var(--color-danger)' }} onClick={confirmState.onConfirm}>确认</Button>
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
