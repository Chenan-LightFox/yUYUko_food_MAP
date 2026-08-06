const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/i;

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
    const previous = right.map((_, index) => index + 1);
    previous.unshift(0);

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
        previous.splice(0, previous.length, ...current);
    }
    return previous[right.length];
}

function areSimilarCategories(leftName, rightName) {
    const left = normalizeMatchValue(leftName);
    const right = normalizeMatchValue(rightName);
    if (!left || !right || left === right) return false;

    const leftLength = Array.from(left).length;
    const rightLength = Array.from(right).length;
    if (Math.min(leftLength, rightLength) >= 2 && (left.includes(right) || right.includes(left))) {
        return true;
    }

    return Math.max(leftLength, rightLength) >= 2 && getEditDistance(left, right) <= 1;
}

function normalizeCategoryName(value) {
    if (typeof value !== 'string') return { error: '分类名称必须是字符串' };
    const name = value.trim().replace(/\s+/g, ' ');
    if (!name) return { error: '分类名称不能为空' };
    if (/[,，]/.test(name)) return { error: '分类名称不能包含逗号' };
    if (HTML_TAG_PATTERN.test(name)) return { error: '分类名称仅支持纯文本' };
    if (getCategoryLength(name) > 16) {
        return { error: '分类名称不能超过8个汉字或16个英文字符' };
    }
    return { name };
}

router.get('/', (req, res) => {
    db.all(
        `SELECT id, name, is_common, sort_order, created_by, created_time
         FROM Category
         ORDER BY is_common DESC, sort_order ASC, name COLLATE NOCASE ASC`,
        [],
        (error, rows) => {
            if (error) return res.status(500).json({ error: error.message });
            res.json((rows || []).map((row) => ({ ...row, is_common: !!row.is_common })));
        }
    );
});

router.post('/', requireAuth, (req, res) => {
    const normalized = normalizeCategoryName(req.body && req.body.name);
    if (normalized.error) return res.status(400).json({ error: normalized.error });
    const allowSimilar = req.body && req.body.allow_similar === true;

    db.all(
        `SELECT id, name, is_common, sort_order, created_by, created_time FROM Category`,
        [],
        (listError, categories) => {
            if (listError) return res.status(500).json({ error: listError.message });

            const exactCategory = (categories || []).find((category) => (
                normalizeMatchValue(category.name) === normalizeMatchValue(normalized.name)
            ));
            if (exactCategory) {
                return res.json({ ...exactCategory, is_common: !!exactCategory.is_common, created: false });
            }

            const similarCategories = (categories || [])
                .filter((category) => areSimilarCategories(category.name, normalized.name))
                .slice(0, 5)
                .map((category) => ({ ...category, is_common: !!category.is_common }));
            if (similarCategories.length > 0 && !allowSimilar) {
                return res.status(409).json({
                    error: '检测到相似分类，请确认后再创建',
                    similar_categories: similarCategories
                });
            }

            db.run(
                `INSERT OR IGNORE INTO Category (name, is_common, sort_order, created_by)
                 VALUES (?, 0, 1000, ?)`,
                [normalized.name, req.user.id],
                function (error) {
                    if (error) return res.status(500).json({ error: error.message });
                    const created = this.changes > 0;
                    db.get(
                        `SELECT id, name, is_common, sort_order, created_by, created_time
                         FROM Category WHERE name = ? COLLATE NOCASE`,
                        [normalized.name],
                        (getError, category) => {
                            if (getError) return res.status(500).json({ error: getError.message });
                            if (!category) return res.status(500).json({ error: '分类创建失败' });
                            res.status(created ? 201 : 200).json({ ...category, is_common: !!category.is_common, created });
                        }
                    );
                }
            );
        }
    );
});

module.exports = router;
