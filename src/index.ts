import { Dialog, Plugin, Setting, type IProtyle } from "siyuan";
import { getBlockAttrs, pushErrMsg, pushMsg } from "@/api";
import { getText, type IText } from "@/i18n";
import IconPicker from "@/components/IconPicker.svelte";
import {
    autoMatchTargets,
    applyIconToTargets,
    getChildTargets,
    getNotebookTargets,
    removeIconFromTargets,
} from "@/service";
import { fetchCollections, searchIconsInSets } from "@/iconify";
import { NativeEmojiPanel } from "@/nativePanel";
import type { IconifyCollectionInfo, IconTarget, IPickerContext, PluginSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import "./index.scss";

interface IEventBusLike {
    on: (type: string, listener: (event: any) => void) => void;
    off: (type: string, listener: (event: any) => void) => void;
}

export default class IconifySetPlugin extends Plugin {
    private settings: PluginSettings = { ...DEFAULT_SETTINGS };
    private recent: string[] = [];
    private text: IText;
    private pickerDialog: Dialog | null = null;
    private pickerComponent: any = null;
    private lastProtyle: IProtyle | null = null;
    private autoTried = new Set<string>();
    private nativePanel: NativeEmojiPanel | null = null;
    private unloaders: (() => void)[] = [];

    async onload() {
        this.text = getText(window.siyuan?.config?.lang || "zh_CN");
        await this.loadSettings();
        await this.loadRecent();
        this.initSettingPanel();
        this.nativePanel = new NativeEmojiPanel(this.settings);
        this.addTopBar({
            icon: "iconImage",
            title: this.text.topbarTitle,
            position: "right",
            callback: () => this.openPickerForCurrentDoc(),
        });
    }

    onLayoutReady() {
        // 把 Iconify 注入思源原生 emoji 面板，实现「点击文件/目录前的图标即可切换」
        this.nativePanel?.start();

        const bus = this.eventBus as unknown as IEventBusLike;

        const menuListener = (event: any) => this.onDocTreeMenu(event);
        bus.on("open-menu-doctree", menuListener);
        this.unloaders.push(() => bus.off("open-menu-doctree", menuListener));

        const titleListener = (event: any) => this.onTitleIconMenu(event);
        bus.on("click-editortitleicon", titleListener);
        this.unloaders.push(() => bus.off("click-editortitleicon", titleListener));

        const loadedListener = (event: any) => this.onProtyleLoaded(event);
        bus.on("loaded-protyle-static", loadedListener);
        this.unloaders.push(() => bus.off("loaded-protyle-static", loadedListener));

        const destroyListener = (event: any) => {
            if (this.lastProtyle === event?.detail?.protyle) {
                this.lastProtyle = null;
            }
        };
        bus.on("destroy-protyle", destroyListener);
        this.unloaders.push(() => bus.off("destroy-protyle", destroyListener));
    }

    async onunload() {
        this.unloaders.forEach((fn) => fn());
        this.unloaders = [];
        this.nativePanel?.stop();
        this.pickerDialog?.destroy();
    }

    openSetting() {
        (this as any).setting?.open(this.displayName || this.name);
    }

    /* ------------------------------------------------------------------ */
    /*                                配置                                 */
    /* ------------------------------------------------------------------ */

    private async loadSettings() {
        const stored = await this.loadData("settings.json");
        this.settings = Object.assign({}, DEFAULT_SETTINGS, stored || {});
        this.settings.searchLimit = clampNumber(this.settings.searchLimit, 10, 500, DEFAULT_SETTINGS.searchLimit);
        this.settings.searchDebounce = clampNumber(this.settings.searchDebounce, 200, 2000, DEFAULT_SETTINGS.searchDebounce);
        this.settings.batchConcurrency = clampNumber(this.settings.batchConcurrency, 1, 10, DEFAULT_SETTINGS.batchConcurrency);
        if (!this.settings.defaultColor) this.settings.defaultColor = DEFAULT_SETTINGS.defaultColor;
        if (!this.settings.iconGroup) this.settings.iconGroup = DEFAULT_SETTINGS.iconGroup;
        if (!Array.isArray(this.settings.enabledCollections)) this.settings.enabledCollections = [];
    }

    private async saveSettings() {
        await this.saveData("settings.json", this.settings);
    }

    private async loadRecent() {
        const stored = await this.loadData("recent.json");
        this.recent = Array.isArray(stored) ? stored.slice(0, 24) : [];
    }

    private addRecent(icon: string) {
        this.recent = [icon, ...this.recent.filter((item) => item !== icon)].slice(0, 24);
        this.saveData("recent.json", this.recent);
    }

    private initSettingPanel() {
        const i18n = (this.i18n || {}) as any;
        const tr = (key: string) => i18n?.[key] || {};
        const setting = new Setting({
            confirmCallback: () => this.saveSettings(),
        });

        setting.addItem({
            title: tr("searchLimit").title || "Search result limit",
            description: tr("searchLimit").description || "Number of icons fetched from Iconify per request",
            createActionElement: () => this.numberInput("searchLimit", 10, 500),
        });
        setting.addItem({
            title: tr("defaultColor").title || "Default icon color",
            description: tr("defaultColor").description || "Color baked into the saved SVG",
            createActionElement: () => this.colorInput("defaultColor"),
        });
        setting.addItem({
            title: tr("iconGroup").title || "Custom icon group",
            description: tr("iconGroup").description || "Folder name under data/emojis",
            createActionElement: () => this.textInput("iconGroup", "iconify-set"),
        });
        setting.addItem({
            title: tr("searchDebounce").title || "Search debounce",
            description: tr("searchDebounce").description || "Debounce delay for the search input in milliseconds",
            createActionElement: () => this.numberInput("searchDebounce", 200, 2000),
        });
        setting.addItem({
            title: tr("batchConcurrency").title || "Batch concurrency",
            description: tr("batchConcurrency").description || "Concurrent requests when applying icons in batch",
            createActionElement: () => this.numberInput("batchConcurrency", 1, 10),
        });
        setting.addItem({
            title: tr("autoIconNewDoc").title || "Auto icon for newly opened docs",
            description: tr("autoIconNewDoc").description || "Automatically set an icon by title when opening a document without icon",
            createActionElement: () => this.checkboxInput("autoIconNewDoc"),
        });
        setting.addItem({
            title: tr("enabledCollections").title || "Icon sets in use",
            description: tr("enabledCollections").description
                || "Choose the Iconify icon sets you want to use. Nothing selected means all icon sets.",
            direction: "row",
            createActionElement: () => this.collectionsPicker(),
        });

        (this as any).setting = setting;
    }

    /** 图标集多选框，支持搜索 / 全选 / 清空 / 反选 */
    private collectionsPicker(): HTMLElement {
        const selected = new Set(this.settings.enabledCollections || []);
        const wrapper = document.createElement("div");
        wrapper.className = "iconify-set__collections";

        const toolbar = document.createElement("div");
        toolbar.className = "iconify-set__collections-toolbar";

        const search = document.createElement("input");
        search.className = "b3-text-field fn__block iconify-set__collections-search";
        search.type = "text";
        search.placeholder = this.text.collectionsSearchPlaceholder;
        toolbar.appendChild(search);

        const makeButton = (label: string, action: () => void) => {
            const button = document.createElement("button");
            button.className = "b3-button b3-button--outline";
            button.type = "button";
            button.textContent = label;
            button.addEventListener("click", () => {
                action();
                this.settings.enabledCollections = Array.from(selected);
                render(search.value);
            });
            toolbar.appendChild(button);
            return button;
        };

        const summary = document.createElement("div");
        summary.className = "iconify-set__collections-summary ft__on-surface";

        const list = document.createElement("div");
        list.className = "iconify-set__collections-list";

        wrapper.append(toolbar, summary, list);

        let collections: IconifyCollectionInfo[] = [];

        const updateSummary = () => {
            summary.textContent = selected.size === 0
                ? this.text.collectionsSummaryNone.replace("${total}", String(collections.length))
                : this.text.collectionsSummarySome.replace("${count}", String(selected.size));
        };

        const render = (filter: string) => {
            const keyword = (filter || "").trim().toLowerCase();
            list.innerHTML = "";
            const matched = collections.filter((item) =>
                !keyword
                || item.prefix.toLowerCase().includes(keyword)
                || item.name.toLowerCase().includes(keyword),
            );
            if (matched.length === 0) {
                const empty = document.createElement("div");
                empty.className = "iconify-set__collections-empty";
                empty.textContent = collections.length === 0 ? this.text.collectionsLoading : this.text.collectionsEmpty;
                list.appendChild(empty);
                updateSummary();
                return;
            }
            matched.forEach((item) => {
                const label = document.createElement("label");
                label.className = "iconify-set__collections-item";

                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.className = "b3-switch fn__flex-center";
                checkbox.checked = selected.has(item.prefix);
                checkbox.addEventListener("change", () => {
                    if (checkbox.checked) {
                        selected.add(item.prefix);
                    } else {
                        selected.delete(item.prefix);
                    }
                    this.settings.enabledCollections = Array.from(selected);
                    updateSummary();
                });

                const text = document.createElement("span");
                text.className = "iconify-set__collections-name";
                text.textContent = item.name;
                text.title = item.name;

                const prefix = document.createElement("code");
                prefix.className = "iconify-set__collections-prefix";
                prefix.textContent = item.prefix;

                const total = document.createElement("span");
                total.className = "iconify-set__collections-total ft__on-surface";
                total.textContent = String(item.total);

                label.append(checkbox, text, prefix, total);
                list.appendChild(label);
            });
            updateSummary();
        };

        makeButton(this.text.collectionsSelectAll, () => {
            collections.forEach((item) => selected.add(item.prefix));
        });
        makeButton(this.text.collectionsClear, () => selected.clear());
        makeButton(this.text.collectionsInvert, () => {
            collections.forEach((item) => {
                if (selected.has(item.prefix)) {
                    selected.delete(item.prefix);
                } else {
                    selected.add(item.prefix);
                }
            });
        });

        search.addEventListener("input", () => render(search.value));
        render("");

        fetchCollections()
            .then((items) => {
                collections = items;
                render(search.value);
            })
            .catch((err) => {
                console.warn("[iconify-set] load collections failed", err);
                render(search.value);
            });

        return wrapper;
    }

    private numberInput(key: keyof PluginSettings, min: number, max: number): HTMLElement {
        const input = document.createElement("input");
        input.className = "b3-text-field fn__block";
        input.type = "number";
        input.min = String(min);
        input.max = String(max);
        input.value = String(this.settings[key]);
        input.addEventListener("change", () => {
            (this.settings[key] as number) = clampNumber(Number(input.value), min, max, DEFAULT_SETTINGS[key] as number);
            input.value = String(this.settings[key]);
        });
        return input;
    }

    private textInput(key: keyof PluginSettings, placeholder: string): HTMLElement {
        const input = document.createElement("input");
        input.className = "b3-text-field fn__block";
        input.type = "text";
        input.placeholder = placeholder;
        input.value = String(this.settings[key] ?? "");
        input.addEventListener("change", () => {
            (this.settings[key] as string) = input.value.trim() || placeholder;
            input.value = this.settings[key] as string;
        });
        return input;
    }

    private colorInput(key: keyof PluginSettings): HTMLElement {
        const input = document.createElement("input");
        input.type = "color";
        input.className = "b3-text-field";
        input.value = String(this.settings[key] || DEFAULT_SETTINGS.defaultColor);
        input.addEventListener("change", () => {
            (this.settings[key] as string) = input.value;
        });
        return input;
    }

    private checkboxInput(key: keyof PluginSettings): HTMLElement {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "b3-switch fn__flex-center";
        input.checked = !!this.settings[key];
        input.addEventListener("change", () => {
            (this.settings[key] as boolean) = input.checked;
        });
        return input;
    }

    /* ------------------------------------------------------------------ */
    /*                              事件监听                               */
    /* ------------------------------------------------------------------ */

    private onProtyleLoaded(event: any) {
        const protyle: IProtyle = event?.detail?.protyle;
        if (!protyle) return;
        this.lastProtyle = protyle;
        if (this.settings.autoIconNewDoc) {
            this.maybeAutoIcon(protyle).catch((err) => console.warn("[iconify-set] auto icon failed", err));
        }
    }

    private async maybeAutoIcon(protyle: IProtyle) {
        const id = protyle.block?.rootID;
        if (!id || this.autoTried.has(id)) return;
        this.autoTried.add(id);
        const attrs = await getBlockAttrs(id).catch(() => null);
        if (!attrs || attrs.icon) return;
        const title = (attrs.title || "").trim();
        if (!title) return;
        const { icons } = await searchIconsInSets(title, this.settings.enabledCollections, { limit: 1 });
        if (!icons.length) return;
        await applyIconToTargets([{ id, title }], icons[0], this.settings.defaultColor || "", this.settings);
        this.addRecent(icons[0]);
    }

    private onDocTreeMenu(event: any) {
        const detail = event?.detail;
        const menu = detail?.menu;
        if (!menu) return;
        const type = detail.type;
        const elements: HTMLElement[] = detail.elements ? Array.from(detail.elements) : [];

        if (type === "doc") {
            const item = detail.items?.[0];
            const id = item?.id || elements[0]?.getAttribute("data-node-id");
            if (!id) return;
            const target = this.targetFromElement(elements[0], id, item?.notebookId, item?.path);
            menu.addItem({
                icon: "iconImage",
                label: this.text.menuSetIcon,
                click: () => this.openPicker([target]),
            });
            menu.addItem({
                icon: "iconImage",
                label: this.text.menuSetIconChildren,
                click: async () => {
                    const children = await getChildTargets(id).catch(() => []);
                    this.openPicker([target, ...children]);
                },
            });
            menu.addItem({
                icon: "iconTrashcan",
                label: this.text.menuRemoveIcon,
                click: async () => {
                    await removeIconFromTargets([target]);
                    pushMsg(this.text.removeIconDone);
                },
            });
            return;
        }

        if (type === "notebook") {
            const notebookId = detail.items?.[0]?.id || elements[0]?.getAttribute("data-url");
            if (!notebookId) return;
            menu.addItem({
                icon: "iconImage",
                label: this.text.menuBatchNotebook,
                click: async () => {
                    const targets = await getNotebookTargets(notebookId).catch(() => []);
                    this.openPicker(targets);
                },
            });
            return;
        }

        if (type === "items" || type === "docs") {
            const targets = this.targetsFromItems(detail.items, elements);
            if (!targets.length) return;
            menu.addItem({
                icon: "iconImage",
                label: this.text.menuSetIcon,
                click: () => this.openPicker(targets),
            });
            menu.addItem({
                icon: "iconTrashcan",
                label: this.text.menuRemoveIcon,
                click: async () => {
                    await removeIconFromTargets(targets);
                    pushMsg(this.text.removeIconDone);
                },
            });
        }
    }

    private onTitleIconMenu(event: any) {
        const detail = event?.detail;
        const menu = detail?.menu;
        const protyle: IProtyle = detail?.protyle;
        if (!menu || !protyle) return;
        const id = protyle.block?.rootID;
        if (!id) return;
        const title = detail?.data?.ial?.title || (protyle as any).title?.editElement?.textContent || "";
        const target: IconTarget = { id, title, notebookId: protyle.notebookId };
        menu.addItem({
            icon: "iconImage",
            label: this.text.menuSetIcon,
            click: () => this.openPicker([target]),
        });
        menu.addItem({
            icon: "iconTrashcan",
            label: this.text.menuRemoveIcon,
            click: async () => {
                await removeIconFromTargets([target]);
                pushMsg(this.text.removeIconDone);
            },
        });
    }

    private targetFromElement(element: HTMLElement | undefined, id: string, notebookId?: string, path?: string): IconTarget {
        const title = element?.querySelector(".b3-list-item__text")?.textContent?.trim() || id;
        const box = notebookId || element?.closest("ul[data-url]")?.getAttribute("data-url") || undefined;
        const docPath = path || element?.getAttribute("data-path") || undefined;
        return { id, title, notebookId: box, path: docPath };
    }

    private targetsFromItems(items: any[] | undefined, elements: HTMLElement[]): IconTarget[] {
        const list = items || [];
        const targets: IconTarget[] = [];
        list.forEach((item, index) => {
            const id = item?.id;
            if (!id) return;
            targets.push(this.targetFromElement(elements[index], id, item?.notebookId, item?.path));
        });
        if (!targets.length) {
            elements.forEach((element) => {
                const id = element.getAttribute("data-node-id");
                if (id) targets.push(this.targetFromElement(element, id));
            });
        }
        return targets;
    }

    /* ------------------------------------------------------------------ */
    /*                              打开选择器                             */
    /* ------------------------------------------------------------------ */

    private openPickerForCurrentDoc() {
        const protyle = this.lastProtyle;
        const id = protyle?.block?.rootID;
        if (!id) {
            pushErrMsg(this.text.noActiveDoc);
            return;
        }
        const title = (protyle as any)?.title?.editElement?.textContent || "";
        this.openPicker([{ id, title, notebookId: protyle?.notebookId }]);
    }

    private openPicker(targets: IconTarget[]) {
        const filtered = (targets || []).filter((item) => item && item.id);
        if (!filtered.length) {
            pushErrMsg(this.text.noActiveDoc);
            return;
        }
        this.pickerDialog?.destroy();

        const ctx: IPickerContext = {
            settings: this.settings,
            recent: this.recent,
            apply: async (list, iconName, color) => {
                await applyIconToTargets(list, iconName, color, this.settings);
            },
            remove: async (list) => {
                await removeIconFromTargets(list);
            },
            autoMatch: (list, color, onProgress, shouldStop) =>
                autoMatchTargets(list, { color, settings: this.settings, onProgress, shouldStop }),
            addRecent: (icon) => this.addRecent(icon),
            close: () => this.pickerDialog?.destroy(),
            toast: (msg, isError) => {
                if (isError) {
                    pushErrMsg(msg);
                } else {
                    pushMsg(msg);
                }
            },
        };

        const dialog = new Dialog({
            title: this.text.pickerTitle,
            content: `<div class="iconify-set__dialog" style="height:100%;overflow:hidden;"></div>`,
            width: "780px",
            height: "640px",
            destroyCallback: () => {
                this.pickerComponent?.$destroy?.();
                this.pickerComponent = null;
                this.pickerDialog = null;
            },
        });
        this.pickerDialog = dialog;

        const container = dialog.element.querySelector(".iconify-set__dialog") as HTMLElement;
        this.pickerComponent = new IconPicker({
            target: container,
            props: { ctx, t: this.text, targets: filtered },
        });
    }
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, Math.round(num)));
}
