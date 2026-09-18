#!/usr/bin/env node
/**
 * 非交互式版本号更新：同时写入 plugin.json 与 package.json。
 *
 * 用法：
 *   node scripts/set_version.js patch        # 0.3.0 -> 0.3.1
 *   node scripts/set_version.js minor        # 0.3.0 -> 0.4.0
 *   node scripts/set_version.js major        # 0.3.0 -> 1.0.0
 *   node scripts/set_version.js 1.2.3        # 指定版本（必须大于当前版本）
 *   node scripts/set_version.js --print      # 只打印当前版本，不做修改
 *   node scripts/set_version.js patch --dry-run
 *
 * 约定：新版本号只输出到 stdout（方便 CI 用 $(...) 捕获），日志一律走 stderr。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TARGETS = ["plugin.json", "package.json", "package-lock.json"];
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

const log = (...msg) => console.error(...msg);

function readJson(file) {
    return JSON.parse(fs.readFileSync(path.resolve(ROOT, file), "utf8"));
}

function writeJson(file, data) {
    // package-lock.json 的版本号有两处：顶层 version 与 packages[""].version，需要一起同步
    if (data.packages && data.packages[""]) {
        data.packages[""].version = data.version;
    }
    fs.writeFileSync(path.resolve(ROOT, file), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function parse(version) {
    const m = SEMVER.exec(version);
    if (!m) throw new Error(`版本号 ${version} 不是合法的语义化版本`);
    return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ?? "" };
}

function compare(a, b) {
    const x = parse(a);
    const y = parse(b);
    for (const key of ["major", "minor", "patch"]) {
        if (x[key] !== y[key]) return x[key] - y[key];
    }
    if (x.pre === y.pre) return 0;
    if (x.pre === "") return 1; // 有预发布号的小于正式版
    if (y.pre === "") return -1;
    return x.pre < y.pre ? -1 : 1;
}

function bump(current, type) {
    const { major, minor, patch } = parse(current);
    switch (type) {
        case "major":
            return `${major + 1}.0.0`;
        case "minor":
            return `${major}.${minor + 1}.0`;
        case "patch":
            return `${major}.${minor}.${patch + 1}`;
        default:
            throw new Error(`未知的升级类型 ${type}`);
    }
}

const argv = process.argv.slice(2).filter((arg) => arg !== "--dry-run");
const dryRun = process.argv.includes("--dry-run");
const target = argv[0];

if (!target) {
    log("用法: node scripts/set_version.js <patch|minor|major|x.y.z|--print> [--dry-run]");
    process.exit(2);
}

try {
    const plugin = readJson("plugin.json");
    const current = plugin.version;
    if (!SEMVER.test(current ?? "")) throw new Error(`plugin.json 里的版本号 ${current} 不合法`);

    if (target === "--print") {
        console.log(current);
        process.exit(0);
    }

    const next = ["patch", "minor", "major"].includes(target) ? bump(current, target) : target;
    if (!SEMVER.test(next)) throw new Error(`目标版本号 ${next} 不合法`);

    if (compare(next, current) <= 0) {
        throw new Error(`新版本号 ${next} 必须大于当前版本号 ${current}（集市要求版本号严格递增）`);
    }

    log(`版本号: ${current} -> ${next}`);
    for (const file of TARGETS) {
        if (!fs.existsSync(path.resolve(ROOT, file))) {
            log(`跳过不存在的 ${file}`);
            continue;
        }
        const data = readJson(file);
        data.version = next;
        if (dryRun) {
            log(`[dry-run] 跳过写入 ${file}`);
            continue;
        }
        writeJson(file, data);
        log(`已更新 ${file}`);
    }

    console.log(next);
} catch (err) {
    log(`✖ ${err.message}`);
    process.exit(1);
}
