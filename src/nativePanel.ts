/**
 * 把 Iconify 注入到思源原生的「emoji / 图标」面板中。
 *
 * 思源在点击文档树列表项前的图标、文档标题图标、笔记本图标时，都会调用
 * `openEmojiPanel()` 打开一个带 `data-key="dialog-emojis"` 的弹窗：
 *
 *   - 根节点： `.emojis`
 *   - emoji 页签：`[data-type="tab-emoji"]`
 *   - 搜索框：`[data-type="tab-emoji"] .b3-text-field`
 *   - 结果容器：`.emojis__panel`
 *   - 每个图标：`button.emojis__item[data-unicode]`
 *
 * 原生弹窗的 click 事件委托在弹窗根节点上，点击 `.emojis__item` 时会读取
 * 其 `data-unicode` 并把它设置为文档 / 笔记本的 icon。因此只要把 Iconify
 * 图标作为 `.emojis__item` 注入，并且保证对应的 SVG 已经存在，
 * 就能像原生 emoji 一样「点击图标即可切换」。
 *
 * 思源要求自定义图标值形如 `<group>/<file>.svg`，文件位于
 * `<工作空间>/data/emojis/<group>/<file>.svg`。
 */
import "iconify-icon";
import { pushErrMsg, readDir } from "./api";
import { ensureIconFile, iconFileName } from "./emoji";
import { searchIconsInSets } from "./iconify";
import type { PluginSettings } from "./types";

const GROUP_CLASS = "iconify-set__native";
const TITLE = "Iconify";
const MIN_QUERY_LENGTH = 2;

export class NativeEmojiPanel {
    private settings: PluginSettings;
    private observer: MutationObserver | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private requestId = 0;
    private knownFiles = new Set<string>();
    private filesLoaded = false;
    private filesPromise: Promise<void> | null = null;

    constructor(settings: PluginSettings) {
        this.settings = settings;
    }

    /** 当前面板是否需要注入（用于控制是否绑定 listener） */
    start() {
        if (this.observer) {
            return;
        }
        void this.prepareKnownFiles();
        this.observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach((node) => {
                    if (!(node instanceof HTMLElement)) {
                        return;
                    }
                    if (node.getAttribute("data-key") === "dialog-emojis") {
                        this.bindDialog(node);
                        return;
                    }
                    const nested = node.querySelector?.('[data-key="dialog-emojis"]');
                    if (nested instanceof HTMLElement) {
                        this.bindDialog(nested);
                    }
                });
            }
        });
        // 弹窗直接挂在 body 下；subtree:false 避免监听编辑器的大量 DOM 变化
        this.observer.observe(document.body, { childList: true, subtree: false });
    }

    stop() {
        this.observer?.disconnect();
        this.observer = null;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    /* ------------------------------------------------------------------ */
    /*                            绑定原生面板                             */
    /* ------------------------------------------------------------------ */

    private bindDialog(dialog: HTMLElement) {
        const input = dialog.querySelector<HTMLInputElement>('[data-type="tab-emoji"] .b3-text-field');
        if (!input || (input as any).__iconifySetBound) {
            return;
        }
        (input as any).__iconifySetBound = true;

        const schedule = () => {
            if (this.timer) {
                clearTimeout(this.timer);
            }
            const delay = Math.max(200, this.settings.searchDebounce || 300);
            this.timer = setTimeout(() => {
                this.search(dialog, input.value).catch((err) => console.warn("[iconify-set] native search failed", err));
            }, delay);
        };
        input.addEventListener("input", schedule);
        input.addEventListener("compositionend", schedule);
        void this.prepareKnownFiles();
    }

    private async search(dialog: HTMLElement, rawQuery: string) {
        const panel = dialog.querySelector<HTMLElement>(".emojis__panel");
        if (!panel) {
            return;
        }
        panel.querySelectorAll(`.${GROUP_CLASS}`).forEach((node) => node.remove());

        const query = rawQuery.trim();
        if (query.length < MIN_QUERY_LENGTH) {
            return;
        }

        const id = ++this.requestId;
        let icons: string[] = [];
        try {
            // 原生面板比较小，限制一下渲染数量，避免一次性请求过多图标
            const limit = Math.min(this.settings.searchLimit || 60, 60);
            const result = await searchIconsInSets(query, this.settings.enabledCollections, { limit });
            // 限定图标集时返回的是合并后的完整列表，这里只取前 limit 个渲染
            icons = result.icons.slice(0, limit);
        } catch (err) {
            console.warn("[iconify-set] search failed", err);
            return;
        }
        if (id !== this.requestId) {
            return;
        }
        // 原生 renderSearch 会重置 panel，重新获取一次保证节点还在
        const currentPanel = dialog.querySelector<HTMLElement>(".emojis__panel");
        if (!currentPanel || !icons.length) {
            return;
        }
        currentPanel.querySelectorAll(`.${GROUP_CLASS}`).forEach((node) => node.remove());
        currentPanel.prepend(this.buildSection(icons));
    }

    private buildSection(icons: string[]): HTMLElement {
        const color = this.settings.defaultColor || "";
        const section = document.createElement("div");
        section.className = `emojis__section ${GROUP_CLASS}`;

        const title = document.createElement("div");
        title.className = "emojis__title";
        title.textContent = TITLE;
        section.appendChild(title);

        const content = document.createElement("div");
        content.className = "emojis__content";
        icons.forEach((iconName) => content.appendChild(this.buildItem(iconName, color)));
        section.appendChild(content);
        return section;
    }

    private buildItem(iconName: string, color: string): HTMLElement {
        const button = document.createElement("button");
        button.className = "emojis__item ariaLabel";
        button.setAttribute("aria-label", iconName);
        button.title = iconName;

        const value = `${this.settings.iconGroup}/${iconFileName(iconName, color)}`;
        button.setAttribute("data-unicode", value);

        const icon = document.createElement("iconify-icon");
        icon.setAttribute("icon", iconName);
        icon.setAttribute("style", `width:24px;height:24px;${color ? `color:${color};` : ""}`);
        button.appendChild(icon);

        // 使用捕获阶段，确保能在原生委托处理前拦截，并同步阻止冒泡
        button.addEventListener(
            "click",
            (event) => this.handleItemClick(event, button, iconName, color, value),
            true,
        );
        return button;
    }

    private handleItemClick(
        event: MouseEvent,
        button: HTMLElement,
        iconName: string,
        color: string,
        value: string,
    ) {
        // 文件已存在（或本次已保存过）时直接交给原生逻辑处理
        if (button.dataset.iconifySaved === "1" || (this.filesLoaded && this.knownFiles.has(value))) {
            return;
        }
        // 必须同步阻止事件，否则原生委托会立刻应用一个尚不存在的图标
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (button.dataset.iconifyBusy === "1") {
            return;
        }
        button.dataset.iconifyBusy = "1";
        button.style.opacity = "0.4";

        ensureIconFile(iconName, color, this.settings.iconGroup)
            .then(() => {
                this.knownFiles.add(value);
                button.dataset.iconifyBusy = "";
                button.dataset.iconifySaved = "1";
                button.style.opacity = "";
                // 重新派发点击事件，让原生委托逻辑真正应用图标
                button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
            })
            .catch((err) => {
                button.dataset.iconifyBusy = "";
                button.style.opacity = "";
                pushErrMsg(err?.message || String(err));
            });
    }

    /* ------------------------------------------------------------------ */
    /*                            已存在文件缓存                           */
    /* ------------------------------------------------------------------ */

    private prepareKnownFiles(): Promise<void> {
        if (!this.filesPromise) {
            this.filesPromise = readDir(`/data/emojis/${this.settings.iconGroup}`)
                .then((entries) => {
                    entries.forEach((entry) => this.knownFiles.add(`${this.settings.iconGroup}/${entry.name}`));
                })
                .catch(() => {
                    // 目录还不存在，忽略
                })
                .finally(() => {
                    this.filesLoaded = true;
                });
        }
        return this.filesPromise;
    }
}
