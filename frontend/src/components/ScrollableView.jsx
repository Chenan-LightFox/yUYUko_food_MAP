import React from 'react';

export default function ScrollableView({ children, style = {}, className = "", as: Component = 'div', ...props }) {
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
                    background: var(--color-border);
                    border-radius: 4px;
                }
                .yuyuko-custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: var(--color-text-muted);
                }
            `}</style>
            <Component
                className={`yuyuko-custom-scrollbar ${className}`.trim()}
                style={{
                    overflowY: 'auto',
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'var(--color-border) transparent',
                    ...style
                }}
                {...props}
            >
                {children}
            </Component>
        </>
    );
}
