# AGENT.md

> 给后续维护者 / AI Agent 的项目说明。先读这份文件，再动代码。

## 1. 项目简介

`iconify-set` 是一个思源笔记（SiYuan）插件，用 [Iconify](https://icon-sets.iconify.design/) 的 20 万+ 开源图标为**文档、笔记本设置图标**。

核心体验（与参考插件 [siyuan-plugin-iconify-emoji](https://github.com/shijianjs/siyuan-plugin-iconify-emoji) 对齐）：

- 点击文档树里**文件 / 笔记本前面的图标**，思源弹出原生图标面板，面板中搜索即可显示 Iconify 结果，点一下就切换；
- 文档标题图标、笔记本图标同理；
- 另外提供右键菜单、顶部工具栏按钮、独立选择器（支持颜色、最近使用、按图标集浏览）、批量设置、按标题自动匹配。

## 2. 技术栈与命令

- 语言：TypeScript
- 构建：Vite 5（library 模式，输出 CommonJS，`siyuan` 为 external）
- UI：Svelte 4（仅独立选择器组件 `IconPicker.svelte`）
- 样式：SCSS + Svelte scoped style
- 图标渲染：`iconify-icon` Web Component（运行时从 `api.iconify.design` 拉取）
- 图标搜索 / 下载：Iconify REST API（`fetch`）

```bash
npm install
npm run dev            # watch 构建到 dev/（inline sourcemap）
npm run build          # 构建到 dist/ 并生成 package.zip
npm run make-link      # 把 dev/ 软链到 <工作空间>/data/plugins/iconify-set
npm run make-link-win  # 需要管理员权限时用这个
npm run make-install   # 构建并把 dist/ 复制到 <工作空间>/data/plugins/iconify-set
npm run update-version # 交互式改 plugin.json / package.json 版本号
node scripts/gen_assets.mjs  # 重新生成 icon.png / preview.png
```

## 3. 目录结构

```
.
├─ plugin.json                 # 思源插件清单（name 必须与目录名一致！）
├─ package.json
├─ vite.config.ts              # 构建配置 + 清单名校验插件
├─ svelte.config.js
├─ tsconfig.json / tsconfig.node.json
├─ public/i18n/
│  ├─ zh_CN.json               # 设置项文案（key 与 SettingUtils 无关，直接手写）
│  └─ en_US.json
├─ src/
│  ├─ index.ts                 # 插件主体：设置面板、事件钩子、菜单、打开选择器
│  ├─ nativePanel.ts           # 【核心】注入思源原生图标面板
│  ├─ iconify.ts               # Iconify API 客户端（search / collections / svg）
│  ├─ emoji.ts                 # SVG 落盘到 data/emojis，生成 icon 值
│  ├─ service.ts               # 业务层：应用/移除图标、批量、按标题自动匹配、并发池
│  ├─ refresh.ts               # 修改 icon 后手动刷新文档树 / 大纲 / 标题图标
│  ├─ api.ts                   # 思源内核 API 封装
│  ├─ types.ts                 # 类型 + 默认设置
│  ├─ i18n.ts                  # 界面文案（非设置项）
│  ├─ components/
│  │  └─ IconPicker.svelte     # 独立图标选择器 UI
│  ├─ index.scss               # 全局样式（设置面板、选择器、注入分组）
│  └─ global.d.ts
├─ scripts/                    # 开发/发布辅助脚本（来自 frostime 模板）
├─ README.md / README_zh_CN.md
└─ CHANGELOG.md
```

## 4. 关键领域知识（务必先理解）

### 4.1 思源自定义图标（emoji）

- 文件放在 `<工作空间>/data/emojis/<group>/<file>.svg`；
- 通过 URL `/emojis/<group>/<file>.svg` 访问；
- 文档的 `icon` **块属性**值就是 `<group>/<file>.svg`（不含前导 `/`）；
- 渲染时 `unicode2Emoji(value)` 判断 `value.includes(".")` → 走 `<img src="/emojis/<value>">`；
- 笔记本使用 `/api/notebook/setNotebookIcon`，文档使用 `/api/attr/setBlockAttrs { icon }`。

### 4.2 本插件的命名规则

`src/emoji.ts` 的 `iconFileName(iconName, color)`：

```
mdi:home + #1e88e5  ->  mdi--home--1e88e5.svg
值 = <iconGroup>/mdi--home--1e88e5.svg   // 默认 group = iconify-set
```

- 颜色被固化进 SVG，所以文件名带颜色，同一图标不同颜色是不同文件；
- 原因：思源用 `<img>` 渲染，`currentColor` 无法继承主题色，只能把颜色写进 SVG；
- `ensureIconFile()` 会话内用 `Map` 缓存，避免重复下载/上传。

### 4.3 【最重要的坑】清单名与目录名必须一致

思源内核 `kernel/bazaar/package.go`：

```go
func IsValidInstalledPackage(pkg *Package, dirName string) bool {
    return pkg != nil && pkg.Name == dirName && IsValidPackageName(pkg.Name)
}
```

即 **`plugin.json` 的 `name` == 插件目录名 == `data/plugins/<安装目录名>`**，否则报
「集市包安装目录名与清单文件中的 name 字段值不一致」。

因此：

- 本仓库目录名 = `iconify-set`，`plugin.json.name` = `iconify-set`；
- 安装目录必须是 `data/plugins/iconify-set/`；
- 发布到集市时 GitHub 仓库名也要与之对应；
- **`vite.config.ts` 里的 `checkManifestName()` 会在构建时校验目录名与 `name`，不一致直接 build 报错。**
  如果你要改插件名，记得同时改目录名 / 仓库名，否则构建会失败（这是刻意的）。

### 4.4 思源原生 emoji 面板 DOM（`nativePanel.ts` 依赖）

点击文档树图标 / 标题图标 / 笔记本图标时，思源调用 `openEmojiPanel()` 打开弹窗：

```
[data-key="dialog-emojis"]            # 弹窗根节点
└─ .emojis
   └─ [data-type="tab-emoji"]         # emoji 页签
      ├─ input.b3-text-field          # 搜索框（注入监听器）
      └─ .emojis__panel               # 结果容器（注入点）
         └─ button.emojis__item[data-unicode]   # 单个图标
```

- 原生 click 事件**委托在弹窗根节点**上，点击 `.emojis__item` 会读取 `data-unicode` 并应用；
- 面板容器由 `EmojiPanelController` 在每次输入时 `innerHTML` 重建（有虚拟滚动），
  所以注入必须**在原生渲染之后**（我们用防抖时机错开）；
- 切换页签 / 分类按钮也会重建面板，注入内容会被清除，属预期。

### 4.5 「先落盘再应用」的点击拦截（易踩坑）

原生逻辑不会先下载文件，直接把 `data-unicode` 写进 `icon` 属性；如果文件不存在就会显示空白。
所以 `nativePanel.ts#handleItemClick`：

1. 用**捕获阶段**监听 `click`，同步 `preventDefault + stopPropagation + stopImmediatePropagation`，
   阻止原生委托先执行（这一步不能 `await`，否则事件早就冒泡完了）；
2. `ensureIconFile()` 下载并保存 SVG；
3. 给按钮打上 `data-iconify-saved` 标记，再 `dispatchEvent(new MouseEvent("click"))` 重新派发；
4. 第二次进入监听器时检测到已保存，直接放行给原生逻辑。

`knownFiles` 来自 `readDir('/data/emojis/<group>')`，用于避免重复下载已存在的文件。

### 4.6 图标集偏好

- 设置项 `enabledCollections: string[]`（Iconify collection prefix），空数组 = 全部；
- 所有搜索入口统一走 `iconify.ts#searchIconsInSets()`；
- Iconify search API **只支持单个 `prefix`**（重复 `prefix` 参数会返回空），所以：
  - 选中 ≤ `MAX_SET_FANOUT`(8) 个：逐集合并发搜索后**交错合并**去重，分页在本地进行；
  - 选中 > 8 个：全局搜一次（limit 999）后按 prefix 过滤；
  - 传了显式 `prefix` 时优先级最高，直接单集合搜索。

## 5. 架构与数据流

```
                    ┌─────────────────────────────┐
点击原生面板图标 →  │ nativePanel.ts              │
                    │  watch [data-key=dialog-…]  │
                    │  search → searchIconsInSets │
                    │  inject .emojis__item       │
                    │  首次点击: ensureIconFile    │
                    │  → 派发 click 交给原生逻辑   │
                    └──────────────┬──────────────┘
                                   │ 原生写 icon 属性
右键菜单 / 顶部按钮 / 批量          │
        │                          ▼
        ▼                  ┌───────────────┐
   IconPicker.svelte ────► │ service.ts    │─► emoji.ts ─► Iconify API + putFile
   (Svelte 组件)            │ apply/remove  │
                            │ autoMatch     │
                            └───────┬───────┘
                                    ▼
                            refresh.ts（手动刷新 DOM）
                            setBlockAttrs / setNotebookIcon
```

关键模块职责：

| 文件 | 职责 |
| --- | --- |
| `index.ts` | 生命周期、设置面板、`eventBus` 钩子、菜单项、打开选择器、组装 `IPickerContext` |
| `nativePanel.ts` | 原生图标面板注入 + 首点击落盘 |
| `iconify.ts` | Iconify API；`searchIcons` / `searchIconsInSets` / `fetchCollections` / `fetchCollectionIcons` / `fetchIconSVG` |
| `emoji.ts` | 图标落盘、值生成、`emojiImgHTML` |
| `service.ts` | 应用/移除/自动匹配、`mapLimit` 并发池、目标文档查询 |
| `refresh.ts` | 直接改 DOM 刷新文档树、大纲、标题图标 |
| `api.ts` | 内核 HTTP API（`setBlockAttrs` / `putFile` / `readDir` / `sql` / `pushMsg` …） |

## 6. 涉及并依赖的思源内部机制

| 机制 | 说明 |
| --- | --- |
| `eventBus: open-menu-doctree` | 文档树右键菜单，`detail.type` 为 `doc`/`notebook`/`items`，`detail.menu.addItem(...)` |
| `eventBus: click-editortitleicon` | 标题图标菜单 |
| `eventBus: loaded-protyle-static` | 记录当前 protyle，用于顶部按钮与「新文档自动图标」 |
| `eventBus: destroy-protyle` | 清理 `lastProtyle` |
| `MutationObserver(document.body)` | 监听原生 emoji 弹窗出现（`subtree: false`，避免监听编辑器 DOM） |
| `/api/attr/setBlockAttrs` | 写文档 `icon` |
| `/api/notebook/setNotebookIcon` | 写笔记本图标（由原生面板逻辑发起，我们只放行） |
| `/api/file/putFile` | 上传 SVG 到 `data/emojis`，会自动创建父目录 |
| `/api/file/readDir` | 检查已存在的图标文件 |
| `/api/query/sql` | 批量场景查询笔记本 / 子文档列表 |

## 7. 设置项一览（`src/types.ts`）

| key | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `searchLimit` | number | 60 | 每次搜索数量（1..500，设置面板会 clamp） |
| `defaultColor` | string | `#1e88e5` | 固化进 SVG 的颜色 |
| `iconGroup` | string | `iconify-set` | `data/emojis/` 下的分组目录 |
| `searchDebounce` | number | 300 | 搜索防抖（≥200） |
| `batchConcurrency` | number | 3 | 批量/自动匹配并发 |
| `autoIconNewDoc` | boolean | false | 打开无图标文档时按标题自动匹配 |
| `enabledCollections` | string[] | `[]` | 只在这些图标集中搜索；空 = 全部 |

设置面板用思源原生 `Setting` API：

- 输入类用 `createActionElement` 返回 `<input>`；
- 图标集复选列表用 `direction: "row"`（这样才会占满整行；`"column"` 会被限制成 `fn__size200`）；
- `confirmCallback` 里调用 `saveSettings()` 持久化。

持久化：`loadData/saveData` → `settings.json`、`recent.json`。

## 8. 扩展指南

### 新增一个设置项

1. `src/types.ts`：加字段 + `DEFAULT_SETTINGS`；
2. `src/index.ts#loadSettings`：如需要做类型/clamp 保护；
3. `src/index.ts#initSettingPanel`：`setting.addItem({...})`；
4. `public/i18n/zh_CN.json` 与 `en_US.json`：加对应 key 的 `title` / `description`。

### 新增一个搜索入口

统一使用 `searchIconsInSets(query, settings.enabledCollections, { limit })`，
不要直接调 `searchIcons`，否则会绕过图标集偏好。

### 新增一个「改 icon 的地方」

1. 写入用 `service.ts` 的 `applyIconToTargets` / `removeIconFromTargets`；
2. 写完调用 `refresh.ts#refreshDocIcon`，否则文档树/标题图标不会更新（插件直接调 API 不触发思源刷新）；
3. 组装 `IconTarget[]`（`id` 必填，`title` 用于自动匹配）。

### 修改原生面板注入

只改 `nativePanel.ts`。注意：选择器来自思源源码，升级思源后需核对
`app/src/emoji/index.ts`（`openEmojiPanel`）里的 DOM 结构与 `data-key`。

## 9. 调试

- 开发者工具 Console 过滤 `[iconify-set]` 前缀；
- 原生面板没出现 Iconify 分组时，检查：
  1. `document.querySelector('[data-key="dialog-emojis"]')` 是否存在、结构是否变化；
  2. 搜索关键词是否 ≥ 2 个字符（`MIN_QUERY_LENGTH`）；
  3. 是否网络无法访问 `api.iconify.design`；
- 图标不显示但点击无反应：多为文件没落盘成功，看 `putFile` 报错；
- 构建报 `plugin.json 的 name ... 与当前目录名 ... 不一致`：见 4.3。

## 10. 已知限制

- 颜色固化导致图标不随主题变色；想要自适应需要改思源渲染方式（不可行），或改成网络图标；
- 原生面板里按 **Enter** 应用当前高亮项时不会触发我们的落盘逻辑（只有鼠标点击会），
  所以 Enter 应用未保存过的 Iconify 图标可能显示空白；这是与参考插件一致的已知限制；
- 原生面板每次输入会重建 `.emojis__panel`，注入分组会在切换页签/分类后消失，需要重新搜索；
- 搜索依赖 Iconify 官方 API，离线不可用；已落盘的图标仍可正常显示。

## 11. 约定

- 提交前跑 `npm run build`（会同时做清单名校验）；
- 修改用户可见行为时更新 `CHANGELOG.md` 与版本号（`npm run update-version`）；
- 设置项文案放 `public/i18n/`，界面文案放 `src/i18n.ts`；
- 不要用 `\` + 空格之类的技巧；不要引入重型依赖（当前运行时依赖只有 `iconify-icon`）；
- 代码注释用中文，标识符用英文。
