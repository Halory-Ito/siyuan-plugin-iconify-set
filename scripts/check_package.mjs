#!/usr/bin/env node
/**
 * 校验插件是否符合「思源社区集市（bazaar）」的收录规则。
 *
 * 规则依据（与集市 PR Check / Stage 的 Go 实现保持一致）：
 *   https://github.com/siyuan-note/bazaar/tree/main/rules
 *   - RequiredFiles：package.zip 根目录必须有 README.md / plugin.json / index.js（大小写敏感）
 *   - Manifest：name / author / url / version 必填；url 必须等于仓库地址；
 *     version 必须是不带 v 前缀的 semver；未列出的字段会导致收录失败
 *   - ZipPaths：zip 内路径分隔符必须为 /，不能有首尾空格
 *
 * 用法：
 *   node scripts/check_package.mjs                                  # 只校验 plugin.json 等元数据
 *   node scripts/check_package.mjs --zip package.zip                # 同时校验打包产物
 *   node scripts/check_package.mjs --repo owner/repo                # 指定仓库（默认取 GITHUB_REPOSITORY / git remote）
 *   node scripts/check_package.mjs --expect-version 0.4.0           # 断言版本号（CI 校验 tag 与清单一致）
 *   node scripts/check_package.mjs --strict-url                     # url 与仓库地址不一致时直接报错
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

// ---------------------------------------------------------------- 参数解析

const args = { zip: null, repo: null, expectVersion: null, strictUrl: false };

function usage() {
    console.log(
        [
            "用法: node scripts/check_package.mjs [选项]",
            "",
            "  --zip <file>             额外校验打包产物（package.zip）",
            "  --repo <owner/repo>      期望的 GitHub 仓库，默认自动探测",
            "  --expect-version <ver>   断言 plugin.json / package.json / zip 内版本号",
            "  --strict-url             url 与仓库地址不一致时报错（默认仅警告）",
        ].join("\n"),
    );
}

for (let i = 0; i < process.argv.length - 2; i++) {
    const arg = process.argv[i + 2];
    switch (arg) {
        case "--zip": args.zip = process.argv[++i + 2]; break;
        case "--repo": args.repo = process.argv[++i + 2]; break;
        case "--expect-version": args.expectVersion = process.argv[++i + 2]; break;
        case "--strict-url": args.strictUrl = true; break;
        case "--help":
        case "-h":
            usage();
            process.exit(0);
            break;
        default:
            console.error(`未知参数: ${arg}`);
            usage();
            process.exit(2);
    }
}

// ---------------------------------------------------------------- 工具

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const RESERVED_PATH_CHARS = ["<", ">", ":", '"', "/", "\\", "|", "?", "*"];
const HTML_SPECIAL_CHARS = ["<", ">", "&", "'", '"'];
const WINDOWS_DEVICE_NAMES = new Set([
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

/** plugin.json 允许出现的字段（多一个都会被集市拒绝） */
const ALLOWED_KEYS = new Set([
    "name", "author", "url", "version",
    "displayName", "description", "readme", "icon", "preview",
    "funding", "keywords", "minAppVersion",
    "backends", "frontends", "kernels", "bootAppearances", "disabledInPublish", "publish",
]);

const ALLOWED_FUNDING_KEYS = new Set(["openCollective", "patreon", "github", "custom", "links"]);

function readJson(file) {
    const abs = path.resolve(ROOT, file);
    if (!fs.existsSync(abs)) {
        fail(`缺少文件 ${file}`);
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(abs, "utf8"));
    } catch (err) {
        fail(`${file} 不是合法 JSON: ${err.message}`);
        return null;
    }
}

function detectRepo() {
    if (args.repo) return args.repo;
    if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
    try {
        const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: ROOT, encoding: "utf8" }).trim();
        const m = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
        if (m) return `${m[1]}/${m[2]}`;
    } catch {
        /* 没有 git 仓库时忽略 */
    }
    return null;
}

function isReservedDeviceName(name) {
    const stem = name.split(".")[0];
    return WINDOWS_DEVICE_NAMES.has(stem.toUpperCase());
}

function isNonEmptyString(v) {
    return typeof v === "string" && v.trim() === v && v !== "";
}

// ---------------------------------------------------------------- 最小 zip 读取

/** 解析 zip 中央目录，返回条目列表（不依赖任何第三方库） */
function readZipEntries(buf) {
    let eocd = -1;
    const minOffset = Math.max(0, buf.length - 0xffff - 22);
    for (let i = buf.length - 22; i >= minOffset; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error("找不到 ZIP 结尾目录（EOCD），文件可能已损坏");

    const total = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const entries = [];
    for (let i = 0; i < total; i++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("ZIP 中央目录结构异常");
        const method = buf.readUInt16LE(p + 10);
        const compSize = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const localOffset = buf.readUInt32LE(p + 42);
        const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
        entries.push({ name, method, compSize, localOffset });
        p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

function readZipFile(buf, entry) {
    const p = entry.localOffset;
    if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error(`条目 ${entry.name} 的局部文件头异常`);
    const nameLen = buf.readUInt16LE(p + 26);
    const extraLen = buf.readUInt16LE(p + 28);
    const start = p + 30 + nameLen + extraLen;
    const data = buf.subarray(start, start + entry.compSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return zlib.inflateRawSync(data);
    throw new Error(`条目 ${entry.name} 使用了不支持的压缩方式（method=${entry.method}）`);
}

// ---------------------------------------------------------------- 清单校验

const manifest = readJson("plugin.json");
const pkg = readJson("package.json");
const repo = detectRepo();

if (manifest) {
    // 1. 必填字段
    for (const key of ["name", "author", "url", "version"]) {
        if (!(key in manifest)) fail(`plugin.json 缺少必填字段 ${key}`);
    }

    // 2. 未知字段（集市会直接拒绝）
    for (const key of Object.keys(manifest)) {
        if (!ALLOWED_KEYS.has(key)) {
            fail(`plugin.json 含有集市不认识的字段 ${key}，请删除（否则思源集市会拒绝收录）`);
        }
    }

    // 3. name 规则
    const name = manifest.name;
    if (typeof name !== "string" || name === "") {
        fail("plugin.json 的 name 必须是非空字符串");
    } else {
        if (Buffer.byteLength(name, "utf8") > 64) fail(`name ${name} 超过 64 字节`);
        if (name.startsWith(" ") || name.endsWith(" ")) fail(`name ${name} 不能以空格开头或结尾`);
        if (name.startsWith(".")) fail(`name ${name} 不能以 . 开头`);
        if (name.endsWith(".")) fail(`name ${name} 不能以 . 结尾`);
        if (/[^\x20-\x7E]/.test(name)) fail(`name ${name} 只能包含可打印 ASCII 字符`);
        for (const ch of RESERVED_PATH_CHARS) {
            if (name.includes(ch)) fail(`name ${name} 含保留字符 ${ch}`);
        }
        for (const ch of HTML_SPECIAL_CHARS) {
            if (name.includes(ch)) fail(`name ${name} 含 HTML 特殊字符 ${ch}`);
        }
        if (isReservedDeviceName(name)) fail(`name ${name} 是 Windows 保留设备名`);
        if (pkg && pkg.name && pkg.name !== name) {
            warn(`package.json 的 name（${pkg.name}）与 plugin.json 的 name（${name}）不一致`);
        }
        if (repo && !repo.endsWith(`/${name}`)) {
            warn(
                `GitHub 仓库名与插件名不一致：仓库 ${repo}，插件 name=${name}。\n` +
                    `    思源按 plugin.json 的 name 决定安装目录，因此仓库名可以不同；\n` +
                    `    但构建时 vite.config.ts 会校验「本地目录名 == name」，CI 里已通过 checkout path 保证。`,
            );
        }
    }

    // 4. author
    if (!isNonEmptyString(manifest.author)) fail("plugin.json 的 author 必须是非空字符串");

    // 5. url 必须等于仓库地址（集市硬性要求）
    const expectUrl = repo ? `https://github.com/${repo}` : null;
    if (!isNonEmptyString(manifest.url)) {
        fail("plugin.json 的 url 必须是非空字符串");
    } else if (expectUrl && manifest.url.toLowerCase() !== expectUrl.toLowerCase()) {
        const msg =
            `plugin.json 的 url 是 ${manifest.url}，集市要求改成本仓库地址 ${expectUrl}\n` +
            `    （集市规则：Manifest 字段 url 必须与 GitHub 仓库地址完全一致）`;
        if (args.strictUrl) fail(msg);
        else warn(msg);
    }

    // 6. version 必须是干净的 semver，且与 package.json 一致
    const version = manifest.version;
    if (!isNonEmptyString(version)) {
        fail("plugin.json 的 version 必须是非空字符串");
    } else {
        if (version.startsWith("v") || version.startsWith("V")) {
            fail(`version ${version} 不能带 v 前缀，请写成 ${version.replace(/^[vV]/, "")}`);
        } else if (!SEMVER.test(version)) {
            fail(`version ${version} 不是合法的语义化版本`);
        }
        if (pkg && pkg.version !== version) {
            fail(`plugin.json 的 version（${version}）与 package.json 的（${pkg.version}）不一致`);
        }
        if (args.expectVersion && version !== args.expectVersion) {
            fail(`当前 version 是 ${version}，但期望 ${args.expectVersion}（tag 与清单不一致）`);
        }
    }

    // 7. 多语言字段
    for (const key of ["displayName", "description", "readme"]) {
        const value = manifest[key];
        if (value === undefined) {
            if (key === "readme") warn("plugin.json 未声明 readme，思源集市将使用 README.md");
            continue;
        }
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
            fail(`plugin.json 的 ${key} 必须是 { locale: string } 对象`);
            continue;
        }
        if (!("default" in value)) fail(`plugin.json 的 ${key} 缺少 default 项`);
        for (const [locale, text] of Object.entries(value)) {
            if (!isNonEmptyString(text)) fail(`plugin.json 的 ${key}.${locale} 必须是非空字符串`);
        }
    }

    // 8. 说明书文件必须真实存在（集市会逐个检查）
    if (manifest.readme && typeof manifest.readme === "object") {
        for (const [locale, file] of Object.entries(manifest.readme)) {
            if (typeof file !== "string" || file === "") continue;
            if (!fs.existsSync(path.resolve(ROOT, file))) {
                fail(`plugin.json 的 readme.${locale} 指向 ${file}，但文件不存在`);
            }
        }
    }
    if (!fs.existsSync(path.resolve(ROOT, "README.md"))) {
        fail("缺少 README.md（package.zip 根目录必须有该文件）");
    }

    // 9. 图片资源
    for (const key of ["icon", "preview"]) {
        if (manifest[key] === undefined) continue;
        if (!isNonEmptyString(manifest[key])) fail(`plugin.json 的 ${key} 必须是非空字符串`);
        else if (!fs.existsSync(path.resolve(ROOT, manifest[key]))) fail(`plugin.json 的 ${key} 指向的文件不存在`);
    }

    // 10. 数组 / 布尔 / funding
    for (const key of ["keywords", "backends", "frontends", "kernels", "bootAppearances"]) {
        const value = manifest[key];
        if (value === undefined) continue;
        if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
            fail(`plugin.json 的 ${key} 必须是字符串数组`);
        }
    }
    for (const key of ["backends", "frontends", "kernels"]) {
        const value = manifest[key];
        if (Array.isArray(value) && value.includes("all") && value.length > 1) {
            fail(`plugin.json 的 ${key} 里写了 "all" 就不能再混入其它取值`);
        }
    }
    if (manifest.disabledInPublish !== undefined && typeof manifest.disabledInPublish !== "boolean") {
        fail("plugin.json 的 disabledInPublish 必须是布尔值");
    }
    if (manifest.minAppVersion !== undefined && !SEMVER.test(manifest.minAppVersion)) {
        fail(`plugin.json 的 minAppVersion ${manifest.minAppVersion} 不是合法的语义化版本`);
    }
    if (manifest.funding !== undefined) {
        const funding = manifest.funding;
        if (typeof funding !== "object" || funding === null || Array.isArray(funding)) {
            fail("plugin.json 的 funding 必须是对象");
        } else {
            for (const key of Object.keys(funding)) {
                if (!ALLOWED_FUNDING_KEYS.has(key)) fail(`plugin.json 的 funding 含未知字段 ${key}`);
            }
            if (funding.custom !== undefined) {
                if (!Array.isArray(funding.custom) || funding.custom.some((v) => typeof v !== "string")) {
                    fail("plugin.json 的 funding.custom 必须是字符串数组");
                } else {
                    for (const item of funding.custom) {
                        if (item.includes("https://ld246.com/sponsor")) {
                            fail("plugin.json 的 funding.custom 仍在使用模板占位链接，请替换或删除");
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- 打包产物校验

if (args.zip) {
    const zipPath = path.resolve(ROOT, args.zip);
    if (!fs.existsSync(zipPath)) {
        fail(`找不到打包产物 ${args.zip}，请先执行 npm run build`);
    } else {
        const buf = fs.readFileSync(zipPath);
        let entries = [];
        try {
            entries = readZipEntries(buf);
        } catch (err) {
            fail(`${args.zip} 解析失败: ${err.message}`);
        }

        for (const entry of entries) {
            if (entry.name.includes("\\")) {
                fail(`${args.zip} 中的 ${entry.name} 使用了反斜杠路径，ZIP 规范要求用 /`);
            }
            const base = entry.name.replace(/\/+$/, "").split("/").pop();
            if (!base) continue;
            if (base !== base.trim()) fail(`${args.zip} 中的 ${entry.name} 首尾有空格，Windows 不支持`);
            if (isReservedDeviceName(base)) fail(`${args.zip} 中的 ${entry.name} 是 Windows 保留设备名`);
        }

        // 集市允许 package.zip 里再套一层目录，这里沿用同样的规则定位包根
        let prefix = "";
        if (!entries.some((e) => e.name === "plugin.json")) {
            const roots = new Set(
                entries
                    .map((e) => e.name.split("/")[0])
                    .filter((seg) => seg && entries.some((e) => e.name === `${seg}/plugin.json`)),
            );
            if (roots.size === 1) {
                prefix = `${[...roots][0]}/`;
                warn(`${args.zip} 内所有文件都在 ${prefix} 下，集市会自动识别但建议直接打包目录内容`);
            }
        }

        for (const required of ["README.md", "plugin.json", "index.js"]) {
            if (!entries.some((e) => e.name === prefix + required)) {
                fail(`${args.zip} 根目录缺少必需文件 ${required}（大小写敏感）`);
            }
        }

        const readmeFiles = new Set(
            manifest?.readme && typeof manifest.readme === "object" ? Object.values(manifest.readme) : [],
        );
        for (const file of readmeFiles) {
            if (typeof file === "string" && file && !entries.some((e) => e.name === prefix + file)) {
                fail(`${args.zip} 缺少 plugin.json 声明的说明书 ${file}`);
            }
        }

        const entry = entries.find((e) => e.name === prefix + "plugin.json");
        if (entry) {
            try {
                const inner = JSON.parse(readZipFile(buf, entry).toString("utf8"));
                // 逐个比对集市会校验的字段，避免 dist/ 里残留旧清单被一起打进包里
                for (const key of ["name", "author", "url", "version"]) {
                    if (manifest && inner[key] !== manifest[key]) {
                        fail(
                            `${args.zip} 内 plugin.json 的 ${key}（${inner[key]}）与源码的（${manifest[key]}）不一致，` +
                                "请删掉 dist/ 后重新构建",
                        );
                    }
                }
                if (args.expectVersion && inner.version !== args.expectVersion) {
                    fail(`${args.zip} 内 plugin.json 的版本 ${inner.version} 与期望的 ${args.expectVersion} 不一致`);
                }
            } catch (err) {
                fail(`无法解析 ${args.zip} 内的 plugin.json: ${err.message}`);
            }
        }
    }
}

// ---------------------------------------------------------------- 输出

for (const msg of warnings) console.warn(`\x1b[33m⚠ ${msg}\x1b[0m`);
for (const msg of errors) console.error(`\x1b[31m✖ ${msg}\x1b[0m`);

if (errors.length > 0) {
    console.error(`\n检查未通过：${errors.length} 个错误，${warnings.length} 个警告`);
    process.exit(1);
}
console.log(`\x1b[32m✔ 检查通过（${warnings.length} 个警告）\x1b[0m`);
