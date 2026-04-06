import { useEffect, useState } from 'react';

function readDark() {
    if (typeof document === 'undefined') return false;
    try {
        return document.documentElement && document.documentElement.getAttribute('data-theme') === 'dark';
    } catch (e) {
        return false;
    }
}

export default function useDarkMode() {
    const [dark, setDark] = useState(readDark());

    useEffect(() => {
        const handler = () => setDark(readDark());
        if (typeof window !== 'undefined') {
            window.addEventListener('themechange', handler);
        }
        return () => {
            if (typeof window !== 'undefined') window.removeEventListener('themechange', handler);
        };
    }, []);

    return dark;
}
