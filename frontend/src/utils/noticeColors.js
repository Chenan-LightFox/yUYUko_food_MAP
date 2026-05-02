export const NOTICE_COLOR_OPTIONS = [
    { key: 'blue', label: '海蓝', backgroundColor: '#e8f1ff' },
    { key: 'green', label: '薄荷绿', backgroundColor: '#e8f8ee' },
    { key: 'amber', label: '琥珀黄', backgroundColor: '#fff4d6' },
    { key: 'rose', label: '玫瑰粉', backgroundColor: '#ffe7ea' },
    { key: 'slate', label: '石墨灰', backgroundColor: '#e9edf3' }
];

export function getNoticeColorOption(colorKey) {
    const normalized = String(colorKey || '').trim().toLowerCase();
    return NOTICE_COLOR_OPTIONS.find((option) => option.key === normalized) || NOTICE_COLOR_OPTIONS[0];
}