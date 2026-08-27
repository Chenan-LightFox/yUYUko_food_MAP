const LEGACY_IMAGE_ORIGIN_PATTERN = /^https?:\/\/dinnerparty\.cc:2053(?=\/|$)/i;
const CANONICAL_IMAGE_ORIGIN = "https://cn.dinnerparty.cc:2053";

function normalizeImageUrl(value) {
    if (typeof value !== "string") return value;
    return value.replace(LEGACY_IMAGE_ORIGIN_PATTERN, CANONICAL_IMAGE_ORIGIN);
}

function normalizeImageUrls(value) {
    if (!Array.isArray(value)) return value;
    return value.map(normalizeImageUrl);
}

module.exports = {
    normalizeImageUrl,
    normalizeImageUrls
};
