/**
 * 将 Iconify 图标保存为思源自定义 emoji，并生成可用于文档 icon 属性的值。
 *
 * 思源自定义图标：文件放在 `<工作空间>/data/emojis/<group>/<file>`，
 * 文档 `icon` 属性填写 `<group>/<file>`（渲染为 `<img src="/emojis/<value>">`）。
 */
import { putFile } from "./api";
import { fetchIconSVG } from "./iconify";

/** 内存缓存，避免同一图标重复上传 */
const savedIcons = new Map<string, Promise<string>>();

function sanitize(segment: string): string {
    return segment.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** 由图标名与颜色生成文件名，例如 `mdi--home--1e88e5.svg` */
export function iconFileName(iconName: string, color: string): string {
    const [prefix, name] = iconName.split(":");
    const colorTag = color ? color.replace(/^#/, "").toLowerCase() : "original";
    return `${sanitize(prefix)}--${sanitize(name)}--${sanitize(colorTag)}.svg`;
}

/**
 * 确保图标文件存在并返回思源图标值。
 * @param iconName 形如 `mdi:home`
 * @param color 形如 `#1e88e5`；传空表示保留原色
 * @param group 自定义图标分组目录名
 * @param svgText 可选的 SVG 文本（避免重复下载）
 */
export function ensureIconFile(
    iconName: string,
    color: string,
    group: string,
    svgText?: string,
): Promise<string> {
    const fileName = iconFileName(iconName, color);
    const value = `${group}/${fileName}`;
    const cacheKey = `${group}|${fileName}`;
    if (!savedIcons.has(cacheKey)) {
        const task = (async () => {
            const svg = svgText ?? (await fetchIconSVG(iconName, color || undefined));
            await putFile(`/data/emojis/${value}`, svg);
            return value;
        })();
        task.catch(() => savedIcons.delete(cacheKey));
        savedIcons.set(cacheKey, task);
    }
    return savedIcons.get(cacheKey)!;
}

/** 生成 `<img>` 形式的图标 HTML（与思源 `unicode2Emoji` 对自定义图标的输出一致） */
export function emojiImgHTML(value: string): string {
    if (!value) return "";
    if (value.includes(".")) {
        return `<img src="/emojis/${value}"/>`;
    }
    // unicode emoji：交由浏览器渲染
    try {
        return value.split("-").map((item) => String.fromCodePoint(parseInt(item.length < 5 ? "0" + item : item, 16))).join("");
    } catch {
        return "";
    }
}
