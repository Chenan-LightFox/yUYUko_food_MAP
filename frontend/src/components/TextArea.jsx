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

const TextArea = forwardRef(({ style = {}, className, rows, ...rest }, ref) => {
    const dark = useDarkMode();
    const themeColor = getThemeColor() || '#E2789F';

    const base = {
        padding: '6px 12px',
        boxSizing: 'border-box',
        borderRadius: 22,
        border: `2px solid ${dark ? 'var(--color-border)' : themeColor}`,
        background: 'var(--color-bg-overlay)',
        color: 'var(--color-text-primary)',
        // Chrome gives <textarea> a different user-agent font by default.
        // Inherit the application font so edit descriptions match labels and other fields.
        fontFamily: 'inherit',
        fontSize: 16,
        lineHeight: 1.5,
        outline: 'none',
        boxShadow: `0 4px 12px ${hexToRgba(themeColor, 0.2)}, 0 0 8px ${hexToRgba(themeColor, 0.25)}`,
        resize: 'vertical',
        minHeight: 80
    };

    const merged = { ...base, ...style };
    const props = { ref, ...rest, className, style: merged };
    if (rows) props.rows = rows;
    return <textarea {...props} />;
});

export default TextArea;
