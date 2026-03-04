function normalizeText(s) {
    return (s || "").toString().trim().toLowerCase();
}

/**
 * 对 places 列表进行模糊搜索
 * @param {Array<Object>} places - 地点列表，每项应包含 name, description, category 等可用于匹配的字段
 * @param {string} q - 查询字符串
 * @param {Object} [opts] - 可选参数，例如 limit
 * @returns {Array<Object>} 匹配结果（未分页）
 */

function fuzzySearch(places, q, opts = {}) {
    if (!q) return places || [];
    const term = normalizeText(q);
    if (!term) return places || [];

    const results = (places || []).filter(p => {
        const hay = [
            p.name || "",
            p.description || "",
            p.category || ""
        ].join(" ").toLowerCase();
        return hay.indexOf(term) !== -1;
    });

    if (opts.limit && Number.isInteger(opts.limit)) {
        return results.slice(0, opts.limit);
    }
    return results;
}

module.exports = { fuzzySearch };
