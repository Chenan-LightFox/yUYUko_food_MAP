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

const TextInput = forwardRef(({ style = {}, className, ...rest }, ref) => {
    const dark = useDarkMode();
    const themeColor = getThemeColor() || '#2065d6';

    const base = {
        padding: '6px 12px',
        height: 44,
        boxSizing: 'border-box',
        borderRadius: 22,
        border: dark ? '2px solid rgba(255,255,255,0.06)' : `2px solid ${themeColor}`,
        background: dark ? '#0b1220' : '#fff',
        color: dark ? '#e5e7eb' : undefined,
        outline: 'none',
        boxShadow: `0 4px 12px ${hexToRgba(themeColor, 0.2)}, 0 0 8px ${hexToRgba(themeColor, 0.25)}`
    };

    const merged = { ...base, ...style };
    return <input ref={ref} {...rest} className={className} style={merged} />;
});

export default TextInput;
