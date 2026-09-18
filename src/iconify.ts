/**
 * Iconify API 客户端
 *
 * - 搜索： https://api.iconify.design/search
 * - 图标集：https://api.iconify.design/collections
 * - 集合内图标：https://api.iconify.design/collection
 * - 单个图标 SVG：https://api.iconify.design/{prefix}/{name}.svg
 *
 * 浏览站点： https://icon-sets.iconify.design/
 */
import type { IconifyCollectionInfo, IconSearchResult } from "./types";

const API = "https://api.iconify.design";

/* -------------------------------------------------------------------------- */
/*                                   搜索                                      */
/* -------------------------------------------------------------------------- */

interface ISearchOptions {
    limit?: number;
    start?: number;
    prefix?: string;
}

export async function searchIcons(query: string, options: ISearchOptions = {}): Promise<IconSearchResult> {
    const params = new URLSearchParams();
    params.set("query", query);
    params.set("limit", String(options.limit ?? 60));
    if (options.start) {
        params.set("start", String(options.start));
    }
    if (options.prefix) {
        params.set("prefix", options.prefix);
    }
    const res = await fetch(`${API}/search?${params.toString()}`);
    if (!res.ok) {
        throw new Error(`Iconify search failed: ${res.status}`);
    }
    const data = await res.json();
    const icons: string[] = data.icons || [];
    return {
        icons,
        total: typeof data.total === "number" ? data.total : icons.length,
    };
}

/* -------------------------------------------------------------------------- */
/*                                  图标集                                     */
/* -------------------------------------------------------------------------- */

let collectionsPromise: Promise<IconifyCollectionInfo[]> | null = null;

interface IRawCollection {
    name?: string;
    total?: number;
    author?: unknown;
    license?: unknown;
    hidden?: boolean;
    category?: string;
}

/**
 * 获取 Iconify 全部图标集，按图标数量倒序。
 * 结果会被缓存（一次会话内只请求一次）。
 */
export function fetchCollections(): Promise<IconifyCollectionInfo[]> {
    if (!collectionsPromise) {
        collectionsPromise = fetch(`${API}/collections`)
            .then((res) => {
                if (!res.ok) throw new Error(`Iconify collections failed: ${res.status}`);
                return res.json();
            })
            .then((data: Record<string, IRawCollection>) => {
                return Object.entries(data)
                    .map(([prefix, info]) => ({
                        prefix,
                        name: info?.name || prefix,
                        total: info?.total || 0,
                        category: info?.category || "",
                    }))
                    .sort((a, b) => b.total - a.total);
            })
            .catch((err) => {
                collectionsPromise = null;
                throw err;
            });
    }
    return collectionsPromise;
}

/* -------------------------------------------------------------------------- */
/*                            浏览某个图标集的所有图标                           */
/* -------------------------------------------------------------------------- */

const collectionIconsCache = new Map<string, Promise<IconSearchResult>>();

interface IRawCollectionData {
    title?: string;
    total?: number;
    categories?: Record<string, string[]>;
    uncategorized?: string[];
}

/** 获取某个图标集的全部图标名（prefix:name 形式） */
export function fetchCollectionIcons(prefix: string): Promise<IconSearchResult> {
    if (!prefix) {
        return Promise.resolve({ icons: [], total: 0 });
    }
    if (!collectionIconsCache.has(prefix)) {
        const promise = fetch(`${API}/collection?prefix=${encodeURIComponent(prefix)}`)
            .then((res) => {
                if (!res.ok) throw new Error(`Iconify collection failed: ${res.status}`);
                return res.json();
            })
            .then((data: IRawCollectionData) => {
                const names: string[] = [];
                if (data.categories) {
                    for (const list of Object.values(data.categories)) {
                        if (Array.isArray(list)) names.push(...list);
                    }
                }
                if (Array.isArray(data.uncategorized)) {
                    names.push(...data.uncategorized);
                }
                const icons = names.map((name) => `${prefix}:${name}`);
                return { icons, total: icons.length };
            })
            .catch((err) => {
                collectionIconsCache.delete(prefix);
                throw err;
            });
        collectionIconsCache.set(prefix, promise);
    }
    return collectionIconsCache.get(prefix);
}

/* -------------------------------------------------------------------------- */
/*                          限定图标集的搜索                                    */
/* -------------------------------------------------------------------------- */

/** 逐个图标集请求的上限，超过就退化为全局搜索后过滤 */
export const MAX_SET_FANOUT = 8;

const normalizePrefixes = (prefixes?: string[]): string[] =>
    Array.from(new Set((prefixes || []).map((item) => (item || "").trim()).filter(Boolean)));

/**
 * 在指定图标集范围内搜索。
 *
 * Iconify 的 search 接口只支持单个 `prefix`，所以：
 * - 未限定图标集：直接全局搜索；
 * - 限定少量图标集：逐个图集并发搜索后交错合并，保证每个偏好图标集都有结果；
 * - 限定大量图标集：全局搜一次（最多 999）后按 prefix 过滤。
 *
 * 限定图标集时返回的是合并后的完整列表，分页在调用方本地进行。
 */
export async function searchIconsInSets(
    query: string,
    prefixes: string[] | undefined,
    options: ISearchOptions = {},
): Promise<IconSearchResult> {
    const sets = normalizePrefixes(prefixes);
    if (sets.length === 0 || options.prefix) {
        return searchIcons(query, options);
    }

    if (sets.length > MAX_SET_FANOUT) {
        const result = await searchIcons(query, { limit: 999, start: 0 });
        const allowed = new Set(sets);
        const icons = result.icons.filter((icon) => allowed.has(icon.split(":")[0]));
        return { icons, total: icons.length };
    }

    const perPrefix = Math.max(8, options.limit ?? 60);
    const results = await Promise.all(
        sets.map((prefix) =>
            searchIcons(query, { limit: perPrefix, prefix }).catch(() => ({ icons: [], total: 0 })),
        ),
    );

    // 交错合并，避免结果被某个图标集全部占据
    const merged: string[] = [];
    const seen = new Set<string>();
    const maxLength = results.reduce((max, item) => Math.max(max, item.icons.length), 0);
    for (let index = 0; index < maxLength; index++) {
        for (const result of results) {
            const icon = result.icons[index];
            if (icon && !seen.has(icon)) {
                seen.add(icon);
                merged.push(icon);
            }
        }
    }
    return { icons: merged, total: merged.length };
}

/* -------------------------------------------------------------------------- */
/*                                 下载 SVG                                   */
/* -------------------------------------------------------------------------- */

/**
 * 下载单个图标的 SVG 文本。
 * @param name 形如 `mdi:home`
 * @param color 形如 `#ff0000`；传空字符串表示保留图标原色
 */
export async function fetchIconSVG(name: string, color?: string): Promise<string> {
    const [prefix, icon] = name.split(":");
    if (!prefix || !icon) {
        throw new Error(`Invalid icon name: ${name}`);
    }
    const params = new URLSearchParams();
    if (color) {
        params.set("color", color);
    }
    const query = params.toString();
    const url = `${API}/${encodeURIComponent(prefix)}/${encodeURIComponent(icon)}.svg${query ? `?${query}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Icon not found: ${name} (${res.status})`);
    }
    return res.text();
}

export { API as ICONIFY_API };
