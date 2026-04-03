import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

const TipsContext = createContext({ showTip: () => { }, hideTip: () => { } });

export function TipsProvider({ children }) {
    const [tip, setTip] = useState(null);
    const [visible, setVisible] = useState(false);
    const timeoutRef = useRef(null);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    const showTip = (message, opts = {}) => {
        const duration = typeof opts.duration === 'number' ? opts.duration : 4000;
        const closable = typeof opts.closable === 'boolean' ? opts.closable : true;
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setTip({ message, closable });
        // trigger enter animation
        setVisible(false);
        // double rAF to ensure transition
        requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));

        if (duration > 0) {
            timeoutRef.current = setTimeout(() => {
                setVisible(false);
                timeoutRef.current = null;
            }, duration);
        }
    };

    const hideTip = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setVisible(false);
    };

    useEffect(() => {
        if (!visible && tip) {
            const t = setTimeout(() => setTip(null), 260);
            return () => clearTimeout(t);
        }
    }, [visible, tip]);

    const overlayStyle = {
        position: 'fixed',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none'
    };

    const tipBase = {
        pointerEvents: 'auto',
        minWidth: 200,
        maxWidth: '80%',
        background: 'rgba(255, 255, 255, 0.85)',
        color: '#3f3f3f',
        padding: '12px 16px',
        borderRadius: 8,
        textAlign: 'center',
        boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
        position: 'relative'
    };

    const tipStyle = (visible) => ({
        ...tipBase,
        paddingRight: tip && tip.closable ? '44px' : '16px',
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 240ms ease, transform 240ms ease'
    });

    const closeStyle = {
        position: 'absolute',
        top: '50%',
        right: 10,
        transform: 'translateY(-50%)',
        border: 'none',
        background: 'transparent',
        color: '#3f3f3f',
        fontSize: 18,
        cursor: 'pointer',
        padding: 0,
        lineHeight: 1
    };

    return (
        <TipsContext.Provider value={{ showTip, hideTip }}>
            {children}
            {tip && (
                <div style={overlayStyle} aria-live="polite">
                    <div style={tipStyle(visible)}>
                        {tip.closable && <button aria-label="关闭" style={closeStyle} onClick={hideTip}>×</button>}
                        <div>{tip.message}</div>
                    </div>
                </div>
            )}
        </TipsContext.Provider>
    );
}

export function useTips() {
    const ctx = useContext(TipsContext);
    return ctx.showTip;
}

export default TipsProvider;
