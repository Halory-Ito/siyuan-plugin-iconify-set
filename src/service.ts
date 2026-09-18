/**
 * 业务层：把 Iconify 图标写到文档上
 */
import { setBlockAttrs, parseIconFromIal, listChildDocs, listDocs, type IconTargetRow } from "./api";
import { ensureIconFile } from "./emoji";
import { refreshDocIcon } from "./refresh";
import { searchIconsInSets } from "./iconify";
import type { IconTarget, PluginSettings } from "./types";

/**
 * 把某个图标应用到一批文档
 * @returns 实际写入的思源图标值
 */
export async function applyIconToTargets(
    targets: IconTarget[],
    iconName: string,
    color: string,
    settings: PluginSettings,
): Promise<string> {
    const value = await ensureIconFile(iconName, color, settings.iconGroup);
    await Promise.all(
        targets.map((target) =>
            setBlockAttrs(target.id, { icon: value }).then(() => refreshDocIcon(target.id, value)),
        ),
    );
    return value;
}

/** 移除一批文档的图标 */
export async function removeIconFromTargets(targets: IconTarget[]): Promise<void> {
    await Promise.all(
        targets.map((target) =>
            setBlockAttrs(target.id, { icon: "" }).then(() => refreshDocIcon(target.id, "")),
        ),
    );
}

/* -------------------------------------------------------------------------- */
/*                                 并发控制                                    */
/* -------------------------------------------------------------------------- */

export async function mapLimit<T, R>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let cursor = 0;
    const size = Math.max(1, limit);
    const runners = new Array(Math.min(size, items.length)).fill(0).map(async () => {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await worker(items[index], index);
        }
    });
    await Promise.all(runners);
    return results;
}

export interface IAutoMatchOptions {
    color: string;
    settings: PluginSettings;
    /** 每个图标集限定，空表示全部 */
    prefix?: string;
    onProgress?: (done: number, total: number, current?: IconTarget) => void;
    shouldStop?: () => boolean;
}

export interface IAutoMatchResult {
    total: number;
    matched: number;
    skipped: number;
    failed: number;
}

/**
 * 按文档标题自动搜索并设置图标。
 * 搜索标题的第一个结果作为该文档的图标。
 */
export async function autoMatchTargets(
    targets: IconTarget[],
    options: IAutoMatchOptions,
): Promise<IAutoMatchResult> {
    const { color, settings, prefix, onProgress, shouldStop } = options;
    let matched = 0;
    let skipped = 0;
    let failed = 0;
    let done = 0;

    await mapLimit(targets, settings.batchConcurrency, async (target) => {
        try {
            if (shouldStop?.()) return;
            const title = (target.title || "").trim();
            if (!title) {
                skipped++;
                return;
            }
            const { icons } = await searchIconsInSets(title, settings.enabledCollections, { limit: 8, prefix });
            if (!icons.length) {
                skipped++;
                return;
            }
            await applyIconToTargets([target], icons[0], color, settings);
            matched++;
        } catch (err) {
            console.warn("[iconify-set] auto match failed", target, err);
            failed++;
        } finally {
            done++;
            onProgress?.(done, targets.length, target);
        }
    });

    return { total: targets.length, matched, skipped, failed };
}

/* -------------------------------------------------------------------------- */
/*                               目标获取                                      */
/* -------------------------------------------------------------------------- */

export function rowToTarget(row: IconTargetRow): IconTarget {
    return {
        id: row.id,
        title: (row.content || "").replace(/<[^>]+>/g, "").trim(),
        notebookId: row.box,
        path: row.path,
        hasIcon: docHasIcon(row),
    };
}

/** 获取笔记本下所有文档 */
export async function getNotebookTargets(notebookId: string): Promise<IconTarget[]> {
    const rows = await listDocs(notebookId);
    return rows.map(rowToTarget);
}

/** 获取文档的所有子文档 */
export async function getChildTargets(docId: string): Promise<IconTarget[]> {
    const rows = await listChildDocs(docId);
    return rows.map(rowToTarget);
}

export function docHasIcon(row: IconTargetRow): boolean {
    const icon = row.icon ?? parseIconFromIal(row.ial || "");
    return !!icon;
}
