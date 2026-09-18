/**
 * 通用类型定义
 */

/** 一个可以设置图标的目标（目前仅支持文档） */
export interface IconTarget {
    /** 文档 block id */
    id: string;
    /** 文档标题，用于界面展示与自动匹配 */
    title?: string;
    /** 笔记本 id */
    notebookId?: string;
    /** 文档路径（不含 .sy） */
    path?: string;
    /** 是否已经设置了图标（用于批量时过滤） */
    hasIcon?: boolean;
}

/** 插件配置 */
export interface PluginSettings {
    /** 每次搜索的数量 */
    searchLimit: number;
    /** 默认固化的颜色，#rrggbb */
    defaultColor: string;
    /** 自定义图标分组目录名 */
    iconGroup: string;
    /** 搜索防抖毫秒 */
    searchDebounce: number;
    /** 批量并发数 */
    batchConcurrency: number;
    /** 新打开文档自动匹配图标 */
    autoIconNewDoc: boolean;
    /** 只在这些图标集（Iconify collection prefix）中搜索；空数组表示全部 */
    enabledCollections: string[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
    searchLimit: 60,
    defaultColor: "#1e88e5",
    iconGroup: "iconify-set",
    searchDebounce: 300,
    batchConcurrency: 3,
    autoIconNewDoc: false,
    enabledCollections: [],
};

/** 图标集的元信息 */
export interface IconifyCollectionInfo {
    prefix: string;
    name: string;
    total: number;
    category?: string;
}

/** 搜索结果 */
export interface IconSearchResult {
    icons: string[];
    total: number;
}

export interface IAutoMatchResult {
    total: number;
    matched: number;
    skipped: number;
    failed: number;
}

/** 图标选择器组件与宿主插件之间的上下文 */
export interface IPickerContext {
    settings: PluginSettings;
    recent: string[];
    /** 把图标应用到目标文档 */
    apply: (targets: IconTarget[], iconName: string, color: string) => Promise<void>;
    /** 移除目标文档的图标 */
    remove: (targets: IconTarget[]) => Promise<void>;
    /** 按标题自动匹配，返回统计信息 */
    autoMatch: (
        targets: IconTarget[],
        color: string,
        onProgress: (done: number, total: number) => void,
        shouldStop: () => boolean,
    ) => Promise<IAutoMatchResult>;
    /** 记录最近使用的图标 */
    addRecent: (icon: string) => void;
    /** 关闭弹窗 */
    close: () => void;
    /** 提示信息 */
    toast: (msg: string, isError?: boolean) => void;
}
