import React from 'react';
import useDarkMode from '../utils/useDarkMode';

export default function ScrollableView({ children, style = {}, className = "", ...props }) {
    const { dark } = useDarkMode();

    // We can use a single global class to avoid generating too many <style> blocks, 
    // or just inject it globally if we can, but since dark mode may change, 
    // injecting via a component ensures the values match the current theme.
    // For a cleaner DOM, we'll use a component-level style but target a specific reusable class.

    return (
        <>
            <style>{`
                .yuyuko-custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                .yuyuko-custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .yuyuko-custom-scrollbar::-webkit-scrollbar-thumb {
                    background: ${dark ? '#475569' : '#cbd5e1'};
                    border-radius: 4px;
                }
                .yuyuko-custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: ${dark ? '#64748b' : '#94a3b8'};
                }
            `}</style>
            <div className={`yuyuko-custom-scrollbar ${className}`} style={{ overflowY: 'auto', ...style }} {...props}>
                {children}
            </div>
        </>
    );
}
