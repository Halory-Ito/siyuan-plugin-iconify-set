<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import "iconify-icon";
    import { fetchCollectionIcons, fetchCollections, searchIcons, searchIconsInSets } from "@/iconify";
    import type { IconTarget, IconifyCollectionInfo, IPickerContext } from "@/types";
    import type { IText } from "@/i18n";

    export let ctx: IPickerContext;
    export let t: IText;
    export let targets: IconTarget[] = [];

    const PRESET_COLORS = [
        "#1e88e5", "#43a047", "#e53935", "#fb8c00",
        "#8e24aa", "#00897b", "#5f6368", "#000000",
    ];

    let query = "";
    let prefix = "";
    let color = ctx.settings.defaultColor || "#1e88e5";
    let originalColor = false;
    let onlyWithoutIcon = false;

    let collections: IconifyCollectionInfo[] = [];
    let allItems: string[] = [];
    let shown = 0;
    let total = 0;
    let loading = false;
    let selected: string | null = null;
    let recent: string[] = [...(ctx.recent || [])];

    let autoRunning = false;
    let autoDone = 0;
    let autoTotal = 0;
    let stopRequested = false;

    let debounceTimer: any;
    let requestId = 0;

    $: pageSize = Math.max(20, ctx.settings.searchLimit || 60);
    $: enabledSets = ctx.settings.enabledCollections || [];
    $: selectableCollections = enabledSets.length
        ? collections.filter((item) => enabledSets.includes(item.prefix))
        : collections;
    $: activeColor = originalColor ? "" : color;
    $: filteredTargets = onlyWithoutIcon ? targets.filter((item) => !item.hasIcon) : targets;
    $: visibleItems = allItems.slice(0, shown);
    $: hasMore = shown < allItems.length || allItems.length < total;
    $: targetSummary = summarizeTargets(targets);

    function summarizeTargets(list: IconTarget[]): string {
        if (list.length <= 3) {
            return list.map((item) => item.title || item.id).join("、");
        }
        return `${list.slice(0, 3).map((item) => item.title || item.id).join("、")} … 共 ${list.length} 个`;
    }

    function resetList() {
        allItems = [];
        shown = 0;
        total = 0;
        selected = null;
        requestId++;
    }

    async function refresh() {
        const q = query.trim();
        if (!q && !prefix) {
            resetList();
            return;
        }
        resetList();
        const id = requestId;
        loading = true;
        try {
            if (!q && prefix) {
                const result = await fetchCollectionIcons(prefix);
                if (id !== requestId) return;
                allItems = result.icons;
                total = result.total;
                shown = Math.min(allItems.length, pageSize);
            } else if (!prefix && enabledSets.length > 0) {
                // 限定了偏好图标集时，结果是合并后的完整列表，分页在本地进行
                const result = await searchIconsInSets(q, enabledSets, { limit: pageSize });
                if (id !== requestId) return;
                allItems = result.icons;
                total = result.total;
                shown = Math.min(allItems.length, pageSize);
            } else {
                const result = await searchIcons(q, {
                    limit: pageSize,
                    start: 0,
                    prefix: prefix || undefined,
                });
                if (id !== requestId) return;
                allItems = result.icons;
                total = result.total;
                shown = allItems.length;
            }
        } catch (err: any) {
            if (id === requestId) {
                ctx.toast(err?.message || String(err), true);
            }
        } finally {
            if (id === requestId) loading = false;
        }
    }

    async function loadMore() {
        if (loading) return;
        const q = query.trim();
        if (!q && prefix) {
            shown = Math.min(allItems.length, shown + pageSize);
            return;
        }
        if (!prefix && enabledSets.length > 0) {
            shown = Math.min(allItems.length, shown + pageSize);
            return;
        }
        if (!q) return;
        const id = ++requestId;
        loading = true;
        try {
            const result = await searchIcons(q, {
                limit: pageSize,
                start: allItems.length,
                prefix: prefix || undefined,
            });
            if (id !== requestId) return;
            const known = new Set(allItems);
            for (const icon of result.icons) {
                if (!known.has(icon)) {
                    allItems.push(icon);
                    known.add(icon);
                }
            }
            total = result.total;
            shown = allItems.length;
        } catch (err: any) {
            if (id === requestId) {
                ctx.toast(err?.message || String(err), true);
            }
        } finally {
            if (id === requestId) loading = false;
        }
    }

    function onQueryInput() {
        clearTimeout(debounceTimer);
        const delay = Math.max(200, ctx.settings.searchDebounce || 300);
        debounceTimer = setTimeout(refresh, delay);
    }

    function onPrefixChange() {
        clearTimeout(debounceTimer);
        refresh();
    }

    function select(icon: string) {
        selected = selected === icon ? null : icon;
    }

    async function applyIcon(icon?: string) {
        const iconName = icon || selected;
        if (!iconName) return;
        if (!filteredTargets.length) {
            ctx.toast(t.pickerNoResult, true);
            return;
        }
        try {
            await ctx.apply(filteredTargets, iconName, activeColor);
            ctx.addRecent(iconName);
            recent = [iconName, ...recent.filter((item) => item !== iconName)].slice(0, 24);
            selected = iconName;
            ctx.toast(t.pickerApplied);
        } catch (err: any) {
            ctx.toast(err?.message || String(err), true);
        }
    }

    async function removeIcons() {
        if (!filteredTargets.length) return;
        try {
            await ctx.remove(filteredTargets);
            ctx.toast(t.pickerRemoved);
        } catch (err: any) {
            ctx.toast(err?.message || String(err), true);
        }
    }

    async function startAutoMatch() {
        if (!filteredTargets.length || autoRunning) return;
        autoRunning = true;
        stopRequested = false;
        autoDone = 0;
        autoTotal = filteredTargets.length;
        try {
            const result = await ctx.autoMatch(
                filteredTargets,
                activeColor,
                (done, totalCount) => {
                    autoDone = done;
                    autoTotal = totalCount;
                },
                () => stopRequested,
            );
            ctx.toast(`${t.pickerAutoDone}: ${result.matched} / ${result.total}`);
        } catch (err: any) {
            ctx.toast(err?.message || String(err), true);
        } finally {
            autoRunning = false;
        }
    }

    onMount(async () => {
        try {
            collections = await fetchCollections();
        } catch (err) {
            console.warn("[iconify-set] load collections failed", err);
        }
    });

    onDestroy(() => {
        clearTimeout(debounceTimer);
    });
</script>

<div class="iconify-set__root">
    <div class="iconify-set__toolbar">
        <div class="iconify-set__search">
            <svg class="iconify-set__search-icon"><use xlink:href="#iconSearch"></use></svg>
            <input
                class="b3-text-field fn__block"
                type="text"
                placeholder={t.pickerSearchPlaceholder}
                bind:value={query}
                on:input={onQueryInput}
            />
        </div>
        <select class="b3-select" bind:value={prefix} on:change={onPrefixChange}>
            <option value="">{t.pickerAllCollections}</option>
            {#each selectableCollections as collection (collection.prefix)}
                <option value={collection.prefix}>
                    {collection.name} ({collection.total})
                </option>
            {/each}
        </select>
    </div>

    <div class="iconify-set__meta">
        <div class="iconify-set__colors">
            <span class="iconify-set__label">{t.pickerColor}</span>
            <input class="iconify-set__color-input" type="color" bind:value={color} disabled={originalColor} />
            {#each PRESET_COLORS as preset (preset)}
                <button
                    class="iconify-set__swatch"
                    class:iconify-set__swatch--active={!originalColor && color.toLowerCase() === preset}
                    style={`background:${preset}`}
                    title={preset}
                    on:click={() => { originalColor = false; color = preset; }}
                ></button>
            {/each}
            <label class="iconify-set__checkbox" title={t.pickerOriginalHint}>
                <input type="checkbox" bind:checked={originalColor} />
                {t.pickerOriginalColor}
            </label>
        </div>
        <div class="iconify-set__status">
            {#if loading}{t.pickerSearching}{/if}
            {#if allItems.length > 0}· {shown} / {total}{/if}
        </div>
    </div>

    {#if recent.length > 0 && !query && !prefix}
        <div class="iconify-set__recent">
            <span class="iconify-set__label">{t.pickerRecent}</span>
            <div class="iconify-set__recent-list">
                {#each recent as icon (icon)}
                    <button
                        class="iconify-set__recent-item"
                        class:iconify-set__recent-item--active={selected === icon}
                        title={icon}
                        on:click={() => select(icon)}
                        on:dblclick={() => applyIcon(icon)}
                    >
                        <iconify-icon icon={icon} style={activeColor ? `color:${activeColor}` : ""}></iconify-icon>
                    </button>
                {/each}
            </div>
        </div>
    {/if}

    <div class="iconify-set__body">
        {#if visibleItems.length > 0}
            <div class="iconify-set__grid">
                {#each visibleItems as icon (icon)}
                    <button
                        class="iconify-set__cell"
                        class:iconify-set__cell--active={selected === icon}
                        title={icon}
                        on:click={() => select(icon)}
                        on:dblclick={() => applyIcon(icon)}
                    >
                        <iconify-icon icon={icon} style={activeColor ? `color:${activeColor}` : ""}></iconify-icon>
                    </button>
                {/each}
            </div>
        {:else if !loading}
            <div class="iconify-set__empty">
                {query || prefix ? t.pickerNoResult : t.pickerBrowseHint}
            </div>
        {/if}
        {#if hasMore && visibleItems.length > 0}
            <div class="iconify-set__more">
                <button class="b3-button b3-button--outline" on:click={loadMore} disabled={loading}>
                    {t.pickerLoadMore}
                </button>
            </div>
        {/if}
    </div>

    {#if autoRunning}
        <div class="iconify-set__progress">
            <div class="iconify-set__progress-bar" style={`width:${autoTotal ? (autoDone / autoTotal) * 100 : 0}%`}></div>
            <span>{t.pickerAutoRunning} {autoDone} / {autoTotal}</span>
            <button class="b3-button b3-button--cancel" on:click={() => (stopRequested = true)}>{t.pickerStop}</button>
        </div>
    {/if}

    <div class="iconify-set__footer">
        <div class="iconify-set__footer-info">
            <div class="iconify-set__targets" title={targetSummary}>
                <b>{t.pickerTargets}</b>：{targetSummary}
            </div>
            <div class="iconify-set__selected">
                {#if selected}
                    {t.pickerSelected}：<code>{selected}</code>
                {/if}
            </div>
            {#if targets.length > 1}
                <label class="iconify-set__checkbox">
                    <input type="checkbox" bind:checked={onlyWithoutIcon} />
                    {t.pickerOnlyNoIcon} ({filteredTargets.length}/{targets.length})
                </label>
            {/if}
        </div>
        <div class="iconify-set__actions">
            <button class="b3-button b3-button--cancel" on:click={removeIcons}>{t.pickerRemove}</button>
            <button class="b3-button b3-button--outline" on:click={startAutoMatch} disabled={autoRunning}>
                {t.pickerAutoMatch}
            </button>
            <div class="fn__space"></div>
            <button class="b3-button b3-button--text" on:click={() => applyIcon()} disabled={!selected}>
                {t.pickerApply}
            </button>
        </div>
    </div>
</div>

<style>
    .iconify-set__root {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: 8px;
        color: var(--b3-theme-on-background);
    }

    .iconify-set__toolbar {
        display: flex;
        gap: 8px;
        flex: 0 0 auto;
    }

    .iconify-set__search {
        position: relative;
        flex: 1 1 auto;
    }

    .iconify-set__search input {
        padding-left: 28px;
    }

    .iconify-set__search-icon {
        position: absolute;
        left: 6px;
        top: 50%;
        transform: translateY(-50%);
        width: 16px;
        height: 16px;
        fill: var(--b3-theme-on-surface);
        pointer-events: none;
    }

    .iconify-set__toolbar select {
        flex: 0 0 auto;
        max-width: 220px;
    }

    .iconify-set__meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex: 0 0 auto;
        flex-wrap: wrap;
    }

    .iconify-set__colors {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
    }

    .iconify-set__label {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
    }

    .iconify-set__color-input {
        width: 28px;
        height: 22px;
        padding: 0;
        border: 1px solid var(--b3-border-color);
        background: none;
        cursor: pointer;
    }

    .iconify-set__swatch {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 2px solid transparent;
        cursor: pointer;
        padding: 0;
    }

    .iconify-set__swatch--active {
        border-color: var(--b3-theme-on-surface);
    }

    .iconify-set__checkbox {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        cursor: pointer;
    }

    .iconify-set__status {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
    }

    .iconify-set__recent {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 0 0 auto;
        overflow: hidden;
    }

    .iconify-set__recent-list {
        display: flex;
        gap: 4px;
        overflow-x: auto;
        flex: 1 1 auto;
    }

    .iconify-set__recent-item {
        flex: 0 0 auto;
        width: 26px;
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        background: var(--b3-theme-surface);
        cursor: pointer;
        font-size: 18px;
    }

    .iconify-set__recent-item--active {
        border-color: var(--b3-theme-primary);
    }

    .iconify-set__body {
        flex: 1 1 auto;
        overflow-y: auto;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        min-height: 120px;
        background: var(--b3-theme-background);
    }

    .iconify-set__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(38px, 1fr));
        gap: 2px;
        padding: 4px;
    }

    .iconify-set__cell {
        aspect-ratio: 1 / 1;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid transparent;
        border-radius: 4px;
        background: none;
        cursor: pointer;
        font-size: 22px;
        color: var(--b3-theme-on-background);
        padding: 0;
    }

    .iconify-set__cell:hover {
        background: var(--b3-list-hover);
    }

    .iconify-set__cell--active {
        border-color: var(--b3-theme-primary);
        background: var(--b3-theme-primary-lightest);
    }

    .iconify-set__more {
        display: flex;
        justify-content: center;
        padding: 8px;
    }

    .iconify-set__empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        min-height: 120px;
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        text-align: center;
        padding: 16px;
    }

    .iconify-set__progress {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        font-size: 12px;
        overflow: hidden;
        flex: 0 0 auto;
    }

    .iconify-set__progress-bar {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        background: var(--b3-theme-primary-lightest);
        transition: width 0.2s ease;
        z-index: 0;
    }

    .iconify-set__progress > * {
        position: relative;
        z-index: 1;
    }

    .iconify-set__progress span {
        flex: 1 1 auto;
    }

    .iconify-set__footer {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 8px;
        flex: 0 0 auto;
        flex-wrap: wrap;
    }

    .iconify-set__footer-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        min-width: 0;
    }

    .iconify-set__targets {
        max-width: 360px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .iconify-set__selected code {
        color: var(--b3-theme-primary);
    }

    .iconify-set__actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 0 0 auto;
    }
</style>
