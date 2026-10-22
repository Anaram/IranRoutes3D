import { PROVINCES, ProvinceShape } from "./geo";

/** Normalises Persian/English province names so «استان تهران», «تهران», "Tehran Province" all match. */
export function normalizeName(raw: string): string {
    let s = " " + String(raw ?? "").trim().toLowerCase() + " ";
    s = s
        .replace(/[يى]/g, "ی")
        .replace(/ك/g, "ک")
        .replace(/[ةۀ]/g, "ه")
        .replace(/[أإآ]/g, "ا")
        .replace(/ؤ/g, "و")
        .replace(/[ً-ٰٟـ]/g, "") // diacritics + tatweel
        .replace(/[‌‏‎_\-–—.,()]/g, " ")
        .replace(/&/g, " and ");
    // standalone connector words and the word "province" are ignored
    s = s.replace(/\s(و|and|va|e)\s/g, " ").replace(/\s(و|and|va|e)\s/g, " ");
    s = s.replace(/استان|province|ostan/g, " ");
    return s.replace(/[^a-z؀-ۿ]/g, "");
}

const index = new Map<string, ProvinceShape>();
const loose = new Map<string, ProvinceShape>();
/** Looser key: every «و» / "and" removed, so «سیستان وبلوچستان», «سیستان‌و‌بلوچستان», «سیستان بلوچستان» all collide. */
const looseKey = (k: string) => k.replace(/و/g, "").replace(/and/g, "");
const EXTRA: Record<string, string[]> = {
    IR13: ["سیستان", "بلوچستان", "سیستان وبلوچستان", "Sistan", "Baluchestan", "Sistan-Baluchestan"],
    IR18: ["کهگیلویه", "کهکیلویه", "بویراحمد", "بویر احمد", "کهگیلویه وبویراحمد", "کهگیلویه و بویر احمد", "Kohgiluyeh", "Kohkiluyeh", "Boyer-Ahmad", "Kohgiluyeh va Boyer-Ahmad"],
    IR08: ["چهارمحال", "چهار محال", "بختیاری", "چهار محال و بختیاری", "چهارمحال وبختیاری", "Chaharmahal", "Bakhtiari", "Chahar Mahal and Bakhtiari"],
    IR01: ["آذربایجان‌شرقی", "آذرباییجان شرقی"],
    IR02: ["آذربایجان‌غربی", "آذرباییجان غربی"],
    IR29: ["خراسان‌جنوبی"], IR28: ["خراسان‌شمالی"], IR30: ["خراسان‌رضوی"],
};
for (const p of PROVINCES) {
    for (const n of [p.fa, p.en, p.id, ...p.aliases, ...(EXTRA[p.id] || [])]) {
        const k = normalizeName(n);
        index.set(k, p);
        loose.set(looseKey(k), p);
    }
}

export function matchProvince(raw: unknown): ProvinceShape | null {
    if (raw === null || raw === undefined) return null;
    const key = normalizeName(String(raw));
    if (!key) return null;
    const exact = index.get(key) ?? loose.get(looseKey(key));
    if (exact) return exact;
    // last resort: a unique province whose name starts with / contains the given text (≥ 4 letters)
    const lk = looseKey(key);
    if (lk.length < 4) return null;
    const hits = new Set<ProvinceShape>();
    for (const [k, p] of loose) if (k.startsWith(lk) || lk.startsWith(k) && k.length >= 4) hits.add(p);
    return hits.size === 1 ? [...hits][0] : null;
}
