/**
 * 界面文案。设置项文案走 public/i18n/*.json，界面文案直接内置，避免遗漏 key。
 */
export interface IText {
    menuSetIcon: string;
    menuSetIconChildren: string;
    menuRemoveIcon: string;
    menuBatchNotebook: string;
    menuAutoNotebook: string;
    noActiveDoc: string;
    setIconDone: string;
    removeIconDone: string;
    resetSettings: string;
    resetSettingsConfirmTitle: string;
    resetSettingsConfirmText: string;
    resetSettingsDone: string;

    pickerSearchPlaceholder: string;
    pickerAllCollections: string;
    pickerColor: string;
    pickerOriginalColor: string;
    pickerRemove: string;
    pickerApply: string;
    pickerAutoMatch: string;
    pickerOnlyNoIcon: string;
    pickerLoadMore: string;
    pickerNoResult: string;
    pickerRecent: string;
    pickerTargets: string;
    pickerSearching: string;
    pickerSelected: string;
    pickerApplied: string;
    pickerRemoved: string;
    pickerAutoRunning: string;
    pickerAutoDone: string;
    pickerStop: string;
    pickerClose: string;
    pickerBrowseHint: string;
    pickerTitle: string;
    pickerOriginalHint: string;

    collectionsSearchPlaceholder: string;
    collectionsSelectAll: string;
    collectionsClear: string;
    collectionsInvert: string;
    collectionsSummaryNone: string;
    collectionsSummarySome: string;
    collectionsLoading: string;
    collectionsEmpty: string;
}

const zh_CN: IText = {
    menuSetIcon: "设置 Iconify 图标",
    menuSetIconChildren: "设置 Iconify 图标（含子文档）",
    menuRemoveIcon: "移除 Iconify 图标",
    menuBatchNotebook: "批量设置文档图标",
    menuAutoNotebook: "按标题自动匹配图标",
    noActiveDoc: "没有找到当前文档",
    setIconDone: "图标设置完成",
    removeIconDone: "图标已移除",
    resetSettings: "重置设置",
    resetSettingsConfirmTitle: "重置设置",
    resetSettingsConfirmText: "确定要把所有设置恢复为默认值吗？此操作不可撤销。",
    resetSettingsDone: "设置已重置",

    pickerSearchPlaceholder: "搜索图标，例如 home、arrow、github…",
    pickerAllCollections: "全部图标集",
    pickerColor: "颜色",
    pickerOriginalColor: "保留原色",
    pickerRemove: "移除图标",
    pickerApply: "应用",
    pickerAutoMatch: "按标题自动匹配",
    pickerOnlyNoIcon: "仅处理无图标的文档",
    pickerLoadMore: "加载更多",
    pickerNoResult: "没有找到匹配的图标",
    pickerRecent: "最近使用",
    pickerTargets: "目标文档",
    pickerSearching: "搜索中…",
    pickerSelected: "已选择",
    pickerApplied: "已应用图标",
    pickerRemoved: "已移除图标",
    pickerAutoRunning: "自动匹配中",
    pickerAutoDone: "自动匹配完成",
    pickerStop: "停止",
    pickerClose: "关闭",
    pickerBrowseHint: "选择一个图标集以浏览其中的全部图标",
    pickerTitle: "Iconify 图标",
    pickerOriginalHint: "保留原色适用于彩色图标；单色图标将以黑色显示",

    collectionsSearchPlaceholder: "搜索图标集名称或 prefix",
    collectionsSelectAll: "全选",
    collectionsClear: "清空",
    collectionsInvert: "反选",
    collectionsSummaryNone: "已选择 0 个，未选择时使用全部 ${total} 个图标集",
    collectionsSummarySome: "已选择 ${count} 个图标集",
    collectionsLoading: "正在加载图标集…",
    collectionsEmpty: "没有匹配的图标集",
};

const en_US: IText = {
    menuSetIcon: "Set Iconify icon",
    menuSetIconChildren: "Set Iconify icon (with sub-documents)",
    menuRemoveIcon: "Remove Iconify icon",
    menuBatchNotebook: "Batch set document icons",
    menuAutoNotebook: "Auto match icons by title",
    noActiveDoc: "No active document found",
    setIconDone: "Icon applied",
    removeIconDone: "Icon removed",
    resetSettings: "Reset settings",
    resetSettingsConfirmTitle: "Reset settings",
    resetSettingsConfirmText: "Are you sure you want to restore all options to their default values? This cannot be undone.",
    resetSettingsDone: "Settings reset",

    pickerSearchPlaceholder: "Search icons, e.g. home, arrow, github…",
    pickerAllCollections: "All icon sets",
    pickerColor: "Color",
    pickerOriginalColor: "Keep original colors",
    pickerRemove: "Remove icon",
    pickerApply: "Apply",
    pickerAutoMatch: "Auto match by title",
    pickerOnlyNoIcon: "Only documents without icon",
    pickerLoadMore: "Load more",
    pickerNoResult: "No matching icon found",
    pickerRecent: "Recent",
    pickerTargets: "Target documents",
    pickerSearching: "Searching…",
    pickerSelected: "Selected",
    pickerApplied: "Icon applied",
    pickerRemoved: "Icon removed",
    pickerAutoRunning: "Auto matching",
    pickerAutoDone: "Auto match finished",
    pickerStop: "Stop",
    pickerClose: "Close",
    pickerBrowseHint: "Choose an icon set to browse all its icons",
    pickerTitle: "Iconify icon",
    pickerOriginalHint: "Keep original colors is for colored icons; monochrome icons will render black",

    collectionsSearchPlaceholder: "Search icon set name or prefix",
    collectionsSelectAll: "Select all",
    collectionsClear: "Clear",
    collectionsInvert: "Invert",
    collectionsSummaryNone: "0 selected. Nothing selected means all ${total} icon sets are used",
    collectionsSummarySome: "${count} icon set(s) selected",
    collectionsLoading: "Loading icon sets…",
    collectionsEmpty: "No matching icon set",
};

export function getText(lang: string): IText {
    if (lang && lang.toLowerCase().startsWith("zh")) {
        return zh_CN;
    }
    return en_US;
}
