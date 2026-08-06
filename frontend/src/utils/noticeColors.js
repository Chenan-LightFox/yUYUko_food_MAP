export const NOTICE_COLOR_OPTIONS = [
    { key: 'blue', label: '隙间蓝', backgroundColor: '#EAF4FC' },
    { key: 'green', label: '幽庭绿', backgroundColor: '#E9F5EF' },
    { key: 'amber', label: '灯笼橙', backgroundColor: '#FFF0E3' },
    { key: 'rose', label: '樱华粉', backgroundColor: '#FCE8EF' },
    { key: 'slate', label: '魂灵紫灰', backgroundColor: '#F2EEF5' }
];

export function getNoticeColorOption(colorKey) {
    const normalized = String(colorKey || '').trim().toLowerCase();
    return NOTICE_COLOR_OPTIONS.find((option) => option.key === normalized) || NOTICE_COLOR_OPTIONS[0];
}
