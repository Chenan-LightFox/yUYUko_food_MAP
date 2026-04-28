import React from 'react';
import ScrollableView from './ScrollableView';

export default function ResponsiveTable({
    children,
    minWidth = 720,
    wrapperStyle = {},
    tableStyle = {},
    style,
    ...tableProps
}) {
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
        <ScrollableView style={containerStyle}>
            <table {...tableProps} style={tableStyle_}>
                {children}
            </table>
        </ScrollableView>
    );
}
