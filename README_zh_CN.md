# Iconify 文档图标（siyuan-plugin-iconify-set）

[English](./README.md)

为思源笔记的**每一个文档**设置一个漂亮的图标。图标数据来自 [Iconify](https://icon-sets.iconify.design/) 的 200,000+ 开源图标集。

## 功能

- **原生图标面板注入（核心）**：直接点击文档树里文件 / 笔记本前面的图标，思源会弹出原生图标面板；面板中搜索时会额外显示 Iconify 结果，点击任意 Iconify 图标即可立刻切换，体验与原生 emoji 一致。文档标题图标、笔记本图标同样支持。
- **文档树右键菜单**：为文档设置 / 移除 Iconify 图标，也可以一键应用到「本页及子文档」。
- **文档标题图标菜单**：点击文档标题左侧图标，选择「设置 Iconify 图标」。
- **顶部工具栏按钮**：为当前文档快速设置图标。
- **笔记本右键菜单**：对整个笔记本的文档批量设置图标。
- **独立图标选择器**：
  - 关键词搜索（Iconify 官方搜索 API）；
  - 按图标集（Iconify Collections）过滤 / 浏览；
  - 颜色选择（内置调色板 + 取色器 + 保留原色）；
  - 最近使用；
  - 加载更多 / 分页。
- **图标集偏好**：在设置里用复选框指定只使用的 Iconify 图标集（支持搜索 / 全选 / 清空 / 反选），未勾选表示全部。原生面板、独立选择器与自动匹配都会在选定范围内搜索。
- **按标题自动匹配**：对选中文档，按文档标题自动搜索图标并应用（支持「仅处理无图标的文档」）。
- **新打开文档自动匹配**（可选，默认关闭）：打开没有图标的文档时，按标题自动设置图标。

## 实现原理

思源的自定义图标（emoji）存放于工作空间的 `data/emojis/<分组>/` 目录，文档的 `icon` 块属性值为 `<分组>/<文件名>`，渲染时变成 `<img src="/emojis/<分组>/<文件名>">`。

**原生面板注入**：思源点击文件树图标 / 文档标题图标 / 笔记本图标时，会打开一个带 `data-key="dialog-emojis"` 的原生弹窗，结构为 `.emojis` → `[data-type="tab-emoji"]` → `.emojis__panel`，每个图标是 `button.emojis__item[data-unicode]`，点击事件的委托处理器会读取 `data-unicode` 并设置为文档 / 笔记本的 icon。本插件通过 `MutationObserver` 监听该弹窗，在搜索框输入时向 `.emojis__panel` 注入一组 Iconify 图标；因为原生图标必须是已存在的本地文件，插件会先拦截首次点击、下载并保存 SVG，再重新派发事件交给思源原生逻辑完成应用。

**图标保存**：

1. 通过 Iconify API 搜索图标，例如 `mdi:home`；
2. 下载图标 SVG：`https://api.iconify.design/mdi/home.svg?color=%231e88e5`；
3. 保存到 `data/emojis/iconify-set/mdi--home--1e88e5.svg`；
4. 通过 `/api/attr/setBlockAttrs` 把文档的 `icon` 属性设为 `iconify-set/mdi--home--1e88e5.svg`（笔记本使用 `/api/notebook/setNotebookIcon`）；
5. 手动刷新文档树、大纲和文档标题上的图标。

> 由于思源使用 `<img>` 渲染自定义图标，图标无法跟随主题变色，因此颜色会固化在 SVG 文件里。文件名中包含颜色，同一图标的不同颜色会保存为不同文件。

## 使用

1. 在思源集市安装并启用插件；
2. **点击文档树里文件 / 笔记本前面的图标**，在弹出的原生面板搜索框输入关键词，下方会出现 Iconify 结果，点击即可切换；
3. 也可以在文档树中右键某个文档 → **设置 Iconify 图标**，使用独立选择器；
4. 批量场景：右键笔记本 → **批量设置文档图标**，选择图标后应用，或点「按标题自动匹配」。

### 本地安装（重要）

思源要求 **插件安装目录名必须与 `plugin.json` 的 `name` 字段完全一致**，否则会报
「集市包安装目录名与清单文件中的 name 字段值不一致」。

本插件：

- 仓库目录名：`iconify-set`
- `plugin.json` 的 `name`：`iconify-set`
- 因此安装目录必须是 `data/plugins/iconify-set/`

推荐做法：

```bash
npm run build
# 关闭思源，把 dist 目录内容复制到：
#   <工作空间>/data/plugins/iconify-set/
# 或使用自动脚本（会自动创建正确命名的目录）
npm run make-install
```

开发调试时用软链：

```bash
npm run dev         # 监听构建到 dev/
npm run make-link   # 把 dev/ 链接为 <工作空间>/data/plugins/iconify-set
```

> 构建时脚本会自动校验目录名与 `name` 是否一致，不一致会直接报错，避免装完才发现。

## 设置项

在「设置 → 集市 → 已下载 → Iconify 文档图标」中配置：

| 设置 | 说明 | 默认值 |
| --- | --- | --- |
| 搜索结果数量 | 每次从 Iconify 拉取的图标数量 | 60 |
| 默认图标颜色 | 保存 SVG 时写入的颜色 | `#1e88e5` |
| 自定义图标分组 | `data/emojis/` 下的目录名 | `iconify-set` |
| 搜索防抖 | 搜索输入防抖（毫秒） | 300 |
| 批量并发数 | 批量 / 自动匹配时的并发数 | 3 |
| 新打开文档自动匹配图标 | 打开无图标文档时按标题自动设置 | 关闭 |
| 使用的图标集 | 勾选只在这些 Iconify 图标集中搜索；一个都不勾选表示全部 | 全部（未勾选） |

## 开发

```bash
npm install
npm run dev      # 监听构建到 dev/
npm run build    # 构建到 dist/ 并打包 package.zip
```

将 `dev/` 目录软链到思源工作空间的 `data/plugins/iconify-set` 即可调试（`npm run make-link`）。

## 致谢

- [Iconify](https://iconify.design/)：开源图标集合与 API
- [siyuan-plugin-iconify-emoji](https://github.com/shijianjs/siyuan-plugin-iconify-emoji)：提供了思源自定义 emoji 与 Iconify 集成的实现思路
- [siyuan](https://github.com/siyuan-note/siyuan)：笔记软件

## License

MIT
