/**
 * 在通过 API 修改文档 icon 属性后，手动刷新界面上的图标。
 *
 * 思源原生代码在 emoji 面板点击后会自行刷新文档树 / 大纲 / 文档标题图标，
 * 但插件直接调用 `/api/attr/setBlockAttrs` 不会触发这些刷新，因此需要手动处理。
 */
import { emojiImgHTML } from "./emoji";

const DEFAULT_DOC_ICON = `<svg><use xlink:href="#iconFile"></use></svg>`;

function setIconInto(container: Element | null, value: string): void {
    if (!container) return;
    container.innerHTML = value ? emojiImgHTML(value) : DEFAULT_DOC_ICON;
}

/** 刷新文档树中的图标 */
function refreshFileTree(id: string, value: string): void {
    const selectors = [
        `[data-type="sidebar-file"] [data-node-id="${id}"]`,
        `.sy__file [data-node-id="${id}"]`,
        `.file-tree [data-node-id="${id}"]`,
        `.file-tree__pins [data-pin-row][data-node-id="${id}"]`,
    ];
    document.querySelectorAll<HTMLElement>(selectors.join(",")).forEach((li) => {
        li.removeAttribute("data-default-icon");
        const icon = li.querySelector(".b3-list-item__icon, .b3-list-item__graphic");
        setIconInto(icon, value);
    });
}

/** 刷新文档顶部标题左侧的大图标 */
function refreshDocHeader(id: string, value: string): void {
    document.querySelectorAll<HTMLElement>(`.protyle-background[data-node-id="${id}"]`).forEach((bg) => {
        const iconElement = bg.querySelector<HTMLElement>(".protyle-background__icon");
        if (!iconElement) return;
        const actions = bg.querySelectorAll<HTMLElement>(".protyle-background__action:not(.fn__flex-center) .b3-button");
        if (value) {
            iconElement.classList.remove("fn__none");
            iconElement.innerHTML = emojiImgHTML(value);
            // [0] 标签 [1] 图标 [2] 背景图
            actions[1]?.classList.add("fn__none");
        } else {
            iconElement.classList.add("fn__none");
            iconElement.innerHTML = "";
            actions[1]?.classList.remove("fn__none");
        }
    });
}

/** 刷新大纲面板中的图标 */
function refreshOutline(id: string, value: string): void {
    document.querySelectorAll<HTMLElement>(`.sy__outline [data-node-id="${id}"]`).forEach((li) => {
        const icon = li.querySelector(".b3-list-item__graphic, .b3-list-item__icon");
        setIconInto(icon, value);
    });
}

/** 刷新某个文档在图谱/关系图等处的图标（目前仅文档树、大纲与标题） */
export function refreshDocIcon(id: string, value: string): void {
    refreshFileTree(id, value);
    refreshDocHeader(id, value);
    refreshOutline(id, value);
}

export function refreshDocIcons(ids: string[], value: string): void {
    ids.forEach((id) => refreshDocIcon(id, value));
}
