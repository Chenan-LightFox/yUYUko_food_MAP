import React, { forwardRef } from 'react';
import useDarkMode from '../utils/useDarkMode';
import { getThemeColor } from '../utils/theme';

function hexToRgba(hex, a = 1) {
    try {
        let h = (hex || '').replace('#', '');
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        const bigint = parseInt(h, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r},${g},${b},${a})`;
    } catch (e) {
        return `rgba(0,0,0,${a})`;
    }
}

const SelectInput = forwardRef(({ style = {}, className, children, ...rest }, ref) => {
    const dark = useDarkMode();
    const themeColor = getThemeColor() || '#E2789F';

    const base = {
        padding: '6px 12px',
        height: 44,
        boxSizing: 'border-box',
        borderRadius: 22,
        border: `2px solid ${dark ? 'var(--color-border)' : themeColor}`,
        background: 'var(--color-bg-overlay)',
        color: 'var(--color-text-primary)',
        outline: 'none',
        boxShadow: `0 4px 12px ${hexToRgba(themeColor, 0.2)}, 0 0 8px ${hexToRgba(themeColor, 0.25)}`
    };

    const merged = { ...base, ...style };
    return (
        <select ref={ref} {...rest} className={className} style={merged}>
            {children}
        </select>
    );
});

export default SelectInput;
