import React from 'react';
import ScrollableView from './ScrollableView';
import useMediaQuery from '../utils/useMediaQuery';

export default function ResponsiveTable({
    children,
    minWidth = 720,
    wrapperStyle = {},
    tableStyle = {},
    style,
    ...tableProps
}) {
    const isMobile = useMediaQuery('(max-width: 640px)');
    const containerStyle = {
        width: '100%',
        maxWidth: '100%',
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
        msOverflowStyle: '-ms-autohiding-scrollbar',
        ...wrapperStyle
    };

    const tableStyle_ = {
        borderCollapse: 'collapse',
        width: '100%',
        minWidth: `max(${minWidth}px, 100%)`,
        ...style,
        ...tableStyle
    };

    return (
        <div style={{ width: '100%', minWidth: 0 }}>
            {isMobile && minWidth > 640 && (
                <div style={{ marginBottom: 6, color: 'var(--color-text-secondary)', fontSize: 12 }}>
                    ← 左右滑动查看完整内容 →
                </div>
            )}
            <ScrollableView style={containerStyle}>
                <table {...tableProps} style={tableStyle_}>
                    {children}
                </table>
            </ScrollableView>
        </div>
    );
}
