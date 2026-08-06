import React, { useEffect, useMemo, useRef, useState } from 'react';
import ScrollableView from './ScrollableView';
import { useConfirm } from './Confirm';
import { useTips } from './Tips';
import { useAuth } from '../AuthContext';
import useDarkMode from '../utils/useDarkMode';
import { colorToRgba, getThemeColor, pickContrastTextColor } from '../utils/theme';
import {
    createCategory as createCategoryRecord,
    fetchCategories
} from '../map/api';

function parseCategories(value) {
    return String(value || '')
        .split(/[,，]/)
        .map(item => item.trim())
        .filter(Boolean)
        .filter((item, index, items) => items.indexOf(item) === index);
}

function serializeCategories(categories) {
    return categories.join(', ');
}

function getCategoryLength(value) {
    return Array.from(value).reduce((length, character) => (
        length + (character.codePointAt(0) > 0x7f ? 2 : 1)
    ), 0);
}

function normalizeMatchValue(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\s·•_\-—()（）/\\]+/g, '');
}

function getEditDistance(leftValue, rightValue) {
    const left = Array.from(leftValue);
    const right = Array.from(rightValue);
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        const current = [leftIndex];
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
            const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
            current[rightIndex] = Math.min(
                current[rightIndex - 1] + 1,
                previous[rightIndex] + 1,
                previous[rightIndex - 1] + substitutionCost
            );
        }
        previous = current;
    }
    return previous[right.length];
}

function isSubsequence(needle, haystack) {
    let index = 0;
    for (const character of haystack) {
        if (character === needle[index]) index += 1;
        if (index === needle.length) return true;
    }
    return false;
}

function getMatchScore(option, rawQuery) {
    const candidate = normalizeMatchValue(option);
    const query = normalizeMatchValue(rawQuery);
    if (!candidate || !query) return Number.POSITIVE_INFINITY;
    if (candidate === query) return 0;
    if (candidate.startsWith(query)) return 1;
    if (candidate.includes(query)) return 2;
    const minimumLength = Math.min(Array.from(candidate).length, Array.from(query).length);
    if (minimumLength >= 2 && query.includes(candidate)) return 2.5;
    if (isSubsequence(query, candidate)) return 3;
    if (minimumLength >= 2 && isSubsequence(candidate, query)) return 3.5;
    if (Math.max(Array.from(candidate).length, Array.from(query).length) >= 2 && getEditDistance(candidate, query) <= 1) return 4;
    return Number.POSITIVE_INFINITY;
}

function tagStyle(dark, themeColor, selected) {
    const background = selected ? themeColor : (dark ? '#334155' : '#f1f5f9');
    return {
        display: 'inline-flex',
        alignItems: 'center',
        height: 28,
        padding: '0 10px',
        borderRadius: 14,
        border: `1px solid ${selected ? themeColor : (dark ? '#475569' : '#cbd5e1')}`,
        background,
        color: selected ? pickContrastTextColor(background) : (dark ? '#e2e8f0' : '#333'),
        fontSize: 12,
        lineHeight: '28px',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        flex: '0 0 auto'
    };
}

function normalizeCategoryRecord(category) {
    return {
        ...category,
        id: category?.id == null ? null : Number(category.id),
        name: String(category?.name || '').trim(),
        is_common: !!category?.is_common
    };
}

export default function CategorySelector({ backendUrl, token, value, onChange, placeholder = '搜索或输入新分类' }) {
    const dark = useDarkMode();
    const confirm = useConfirm();
    const showTip = useTips();
    const { token: contextToken } = useAuth();
    const authToken = token || contextToken;
    const rootRef = useRef(null);
    const inputRef = useRef(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [categoryError, setCategoryError] = useState('');
    const [creating, setCreating] = useState(false);
    const themeColor = getThemeColor() || '#3b82f6';
    const selectedCategories = useMemo(() => parseCategories(value), [value]);
    const normalizedQuery = searchQuery.trim();

    useEffect(() => {
        if (!backendUrl) return undefined;
        let cancelled = false;
        setLoading(true);
        setCategoryError('');
        fetchCategories(backendUrl)
            .then((items) => {
                if (cancelled) return;
                setCategories(items.map(normalizeCategoryRecord).filter(item => item.id && item.name));
            })
            .catch((error) => {
                if (cancelled) return;
                setCategoryError(error?.message || '分类加载失败');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [backendUrl]);

    const availableCategories = useMemo(() => {
        const byName = new Map(categories.map(category => [category.name, category]));
        selectedCategories.forEach((name) => {
            if (!byName.has(name)) {
                byName.set(name, { id: null, name, is_common: false, created_by: null });
            }
        });
        return [...byName.values()];
    }, [categories, selectedCategories]);

    const displayedCategories = useMemo(() => {
        if (!normalizedQuery) {
            return availableCategories
                .filter(category => category.is_common)
                .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
        }
        return availableCategories
            .map(category => ({ category, score: getMatchScore(category.name, normalizedQuery) }))
            .filter(item => Number.isFinite(item.score))
            .sort((left, right) => left.score - right.score || left.category.name.localeCompare(right.category.name, 'zh-CN'))
            .map(item => item.category);
    }, [availableCategories, normalizedQuery]);

    useEffect(() => {
        const handleOutsideClick = (event) => {
            if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, []);

    const updateCategories = (nextCategories) => {
        if (typeof onChange === 'function') onChange(serializeCategories(nextCategories));
    };

    const removeSelectedCategory = async (category) => {
        if (!confirm || !(await confirm(`确认取消选择分类“${category}”？`))) return;
        updateCategories(selectedCategories.filter(item => item !== category));
    };

    const selectCategory = (category) => {
        if (selectedCategories.includes(category.name)) {
            removeSelectedCategory(category.name);
            return;
        }
        updateCategories([...selectedCategories, category.name]);
        setSearchQuery('');
    };

    const upsertCategory = (category) => {
        const normalized = normalizeCategoryRecord(category);
        setCategories((items) => {
            const index = items.findIndex(item => item.id === normalized.id || item.name === normalized.name);
            if (index < 0) return [...items, normalized];
            const next = [...items];
            next[index] = normalized;
            return next;
        });
        return normalized;
    };

    const createCategory = async () => {
        const categoryName = normalizedQuery.replace(/\s+/g, ' ');
        if (!categoryName || creating) return;
        if (/[,，]/.test(categoryName)) {
            showTip && showTip('分类名称不能包含逗号');
            return;
        }
        if (getCategoryLength(categoryName) > 16) {
            showTip && showTip('分类名称不能超过8个汉字或16个英文字符');
            return;
        }
        if (selectedCategories.includes(categoryName)) {
            showTip && showTip('该分类已经选择');
            return;
        }
        if (!authToken) {
            showTip && showTip('请先登录后创建分类');
            return;
        }

        setCreating(true);
        try {
            let categoryResponse;
            try {
                categoryResponse = await createCategoryRecord(backendUrl, authToken, categoryName);
            } catch (error) {
                if (error?.status !== 409 || !error.similarCategories?.length) throw error;
                const similarNames = error.similarCategories.map(category => category.name).filter(Boolean);
                const shouldCreate = confirm && await confirm(
                    `检测到相似分类“${similarNames.join('”、“')}”，仍要创建“${categoryName}”吗？`
                );
                if (!shouldCreate) {
                    showTip && showTip('已取消创建，请选择已有分类');
                    return;
                }
                categoryResponse = await createCategoryRecord(
                    backendUrl,
                    authToken,
                    categoryName,
                    { allowSimilar: true }
                );
            }

            const savedCategory = upsertCategory(categoryResponse);
            updateCategories([...selectedCategories, savedCategory.name]);
            setSearchQuery('');
            setOpen(true);
            window.setTimeout(() => inputRef.current?.focus(), 0);
        } catch (error) {
            showTip && showTip(error?.message || '创建分类失败');
        } finally {
            setCreating(false);
        }
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            createCategory();
        } else if (event.key === 'Escape') {
            setOpen(false);
            inputRef.current?.blur();
        }
    };

    return (
        <div ref={rootRef} style={{ position: 'relative' }}>
            <div
                role="group"
                aria-label="分类搜索与选择"
                onClick={() => {
                    setOpen(true);
                    inputRef.current?.focus();
                }}
                style={{
                    width: '100%',
                    minHeight: 44,
                    padding: '6px 10px',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 6,
                    borderRadius: 22,
                    border: dark ? '2px solid rgba(255,255,255,0.06)' : `2px solid ${themeColor}`,
                    background: dark ? 'var(--theme-secondary)' : '#fff9f6',
                    color: dark ? '#e5e7eb' : undefined,
                    boxShadow: `0 4px 12px ${colorToRgba(themeColor, 0.2)}, 0 0 8px ${colorToRgba(themeColor, 0.25)}`,
                    cursor: 'text'
                }}
            >
                {selectedCategories.map(category => (
                    <button
                        key={category}
                        type="button"
                        aria-pressed="true"
                        title={`取消选择分类“${category}”`}
                        onClick={(event) => {
                            event.stopPropagation();
                            removeSelectedCategory(category);
                        }}
                        style={tagStyle(dark, themeColor, true)}
                    >
                        {category}
                    </button>
                ))}
                <input
                    ref={inputRef}
                    type="search"
                    value={searchQuery}
                    maxLength={16}
                    placeholder={placeholder}
                    aria-label="搜索或创建分类"
                    disabled={creating}
                    onFocus={() => setOpen(true)}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={handleKeyDown}
                    style={{
                        flex: '1 1 100px',
                        minWidth: 100,
                        height: 28,
                        padding: 0,
                        border: 0,
                        outline: 'none',
                        background: 'transparent',
                        color: dark ? '#e5e7eb' : '#111827',
                        fontSize: 14
                    }}
                />
            </div>

            {open && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 5px)',
                    left: 0,
                    width: '100%',
                    zIndex: 20,
                    overflow: 'hidden',
                    border: `1px solid ${dark ? '#334155' : '#ccc'}`,
                    borderRadius: 8,
                    background: dark ? '#1e293b' : '#fff9f6',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.16)'
                }}>
                    <ScrollableView style={{ maxHeight: 220, padding: 10 }}>
                        <div style={{ marginBottom: 8, color: dark ? '#94a3b8' : '#64748b', fontSize: 12, fontWeight: 600 }}>
                            {normalizedQuery ? '匹配分类' : '常用分类'}
                        </div>

                        {loading && <div style={{ color: dark ? '#94a3b8' : '#64748b', fontSize: 12 }}>正在加载分类...</div>}
                        {!loading && categoryError && <div style={{ color: '#ef4444', fontSize: 12 }}>{categoryError}</div>}

                        {!loading && !categoryError && displayedCategories.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {displayedCategories.map(category => {
                                    const selected = selectedCategories.includes(category.name);
                                    return (
                                        <button
                                            key={category.id || category.name}
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => selectCategory(category)}
                                            style={tagStyle(dark, themeColor, selected)}
                                        >
                                            {category.name}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {!loading && !categoryError && !normalizedQuery && displayedCategories.length === 0 && (
                            <div style={{ color: dark ? '#94a3b8' : '#64748b', fontSize: 12 }}>暂无常用分类</div>
                        )}

                        {!loading && !categoryError && !!normalizedQuery && (
                            <div style={{
                                marginTop: displayedCategories.length ? 10 : 0,
                                paddingTop: displayedCategories.length ? 9 : 0,
                                borderTop: displayedCategories.length ? `1px solid ${dark ? '#334155' : '#e5e7eb'}` : 'none',
                                color: dark ? '#cbd5e1' : '#475569',
                                fontSize: 12,
                                lineHeight: 1.5
                            }}>
                                {displayedCategories.length
                                    ? '输入回车创建新分类'
                                    : '当前标签无结果，输入回车创建新分类'}
                            </div>
                        )}
                    </ScrollableView>
                </div>
            )}
        </div>
    );
}
