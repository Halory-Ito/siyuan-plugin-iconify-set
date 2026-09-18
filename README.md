# Iconify Document Icons (siyuan-plugin-iconify-set)

[中文](./README_zh_CN.md)

Set a beautiful icon for **every document** in SiYuan. Icons come from the 200,000+ open source icon sets of [Iconify](https://icon-sets.iconify.design/).

## Features

- **Native icon panel injection (core)**: click the icon in front of a file / notebook in the document tree; SiYuan opens its native icon panel, and while searching, Iconify results are shown below. Clicking an Iconify icon switches it immediately, just like a native emoji. The document title icon and notebook icons work the same way.
- **Document tree context menu**: set / remove an Iconify icon for a document, or apply to "this document and its sub-documents".
- **Document title icon menu**: click the icon at the left of a document title and choose "Set Iconify icon".
- **Notebook context menu**: batch set icons for all documents in a notebook.
- **Standalone icon picker**:
  - keyword search (Iconify search API);
  - filter / browse by icon set (Iconify Collections);
  - color selection (presets + color picker + keep original colors);
  - recently used icons;
  - load more / pagination.
- **Icon set preference**: pick the Iconify icon sets you want to use with checkboxes in settings (search / select all / clear / invert supported). A few common colorful sets are enabled by default; nothing checked means all. The native panel, standalone picker and auto match all search within the selected sets.
- **Auto match by title**: search and apply icons automatically for the selected documents based on their titles (optionally only for documents without an icon).
- **Auto icon for newly opened docs** (optional, disabled by default).

## How it works

SiYuan custom icons (emojis) live in `data/emojis/<group>/` inside the workspace. The document `icon` block attribute stores `<group>/<file>` and is rendered as `<img src="/emojis/<group>/<file>">`.

**Native panel injection**: when clicking a file tree icon / document title icon / notebook icon, SiYuan opens a dialog with `data-key="dialog-emojis"` structured as `.emojis` → `[data-type="tab-emoji"]` → `.emojis__panel`. Each icon is a `button.emojis__item[data-unicode]`, and the delegated click handler reads `data-unicode` and sets it as the document / notebook icon. The plugin watches for that dialog with a `MutationObserver`, and injects a group of Iconify icons into `.emojis__panel` while you type in the search box. Because the native icon must be an existing local file, the plugin intercepts the first click, downloads and saves the SVG, then re-dispatches the event so SiYuan's native logic applies it.

**Saving the icon**:

1. searches icons via the Iconify API, e.g. `mdi:home`;
2. downloads the SVG: `https://api.iconify.design/mdi/home.svg?color=%231e88e5`;
3. saves it to `data/emojis/iconify-set/mdi--home--1e88e5.svg`;
4. sets the document `icon` attribute to `iconify-set/mdi--home--1e88e5.svg` via `/api/attr/setBlockAttrs` (notebooks use `/api/notebook/setNotebookIcon`);
5. refreshes the document tree, outline and title icon.

> Because SiYuan renders custom icons as `<img>`, an icon cannot follow the theme color. The color is baked into the SVG and part of the file name, so different colors of the same icon are stored as different files.

## Usage

1. Install and enable the plugin from the SiYuan Bazaar.
2. **Click the icon in front of a file / notebook in the document tree**, type a keyword in the native panel's search box, and Iconify results appear below — click one to switch.
3. You can also right-click a document → **Set Iconify icon** to use the standalone picker.
4. Batch: right-click a notebook → **Batch set document icons**, then apply an icon or click **Auto match by title**.

### Local install (important)

SiYuan requires the **plugin install directory name to exactly match the `name` field in `plugin.json`**.
Otherwise it reports "the bazaar package install directory name does not match the name field in the manifest".

This plugin:

- repository directory: `iconify-set`
- `plugin.json` `name`: `iconify-set`
- so the install directory must be `data/plugins/iconify-set/`

Recommended:

```bash
npm run build
# close SiYuan and copy the contents of dist/ into:
#   <workspace>/data/plugins/iconify-set/
# or use the helper (creates the correctly named directory automatically)
npm run make-install
```

For development use a symlink:

```bash
npm run dev         # watch build into dev/
npm run make-link   # link dev/ as <workspace>/data/plugins/iconify-set
```

> The build fails early if the directory name and the manifest `name` differ.

## Settings

Open "Settings → Bazaar → Downloaded → Iconify Document Icons":

| Setting | Description | Default |
| --- | --- | --- |
| Search result limit | Icons fetched per request | 60 |
| Default icon color | Color baked into the SVG | `#1e88e5` |
| Custom icon group | Folder name under `data/emojis/` | `iconify-set` |
| Search debounce | Search input debounce (ms) | 300 |
| Batch concurrency | Concurrent requests for batch / auto match | 3 |
| Auto icon for newly opened docs | Auto set icon by title when opening a doc without icon | Off |
| Icon sets in use | Only search in the checked Iconify icon sets; nothing checked means all | 7 curated colorful sets |

A **Reset settings** button at the bottom of the settings page restores every option to its default value. A confirmation dialog is shown first.

## Development

```bash
npm install
npm run dev      # watch build into dev/
npm run build    # build into dist/ and create package.zip
```

Symlink `dev/` into the SiYuan workspace at `data/plugins/iconify-set` for debugging (`npm run make-link`).

## Credits

- [Iconify](https://iconify.design/): open source icon sets and API
- [siyuan-plugin-iconify-emoji](https://github.com/shijianjs/siyuan-plugin-iconify-emoji): the reference implementation for integrating Iconify with SiYuan custom emojis
- [siyuan](https://github.com/siyuan-note/siyuan)

## License

MIT
