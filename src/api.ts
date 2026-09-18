/**
 * 思源内核 API 封装
 * 参考：https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md
 */
import { fetchPost, fetchSyncPost, type IWebSocketData } from "siyuan";

async function request<T = any>(url: string, data: any): Promise<T> {
    const response: IWebSocketData = await fetchSyncPost(url, data);
    if (response.code !== 0) {
        throw new Error(`${url} -> [${response.code}] ${response.msg}`);
    }
    return response.data as T;
}

/** 异步版本，不阻塞 */
export function requestAsync(url: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
        fetchPost(url, data, (response: IWebSocketData) => {
            if (response.code !== 0) {
                reject(new Error(`${url} -> [${response.code}] ${response.msg}`));
                return;
            }
            resolve(response.data);
        });
    });
}

// ************************************ 属性 ************************************

export function setBlockAttrs(id: string, attrs: { [key: string]: string }) {
    return requestAsync("/api/attr/setBlockAttrs", { id, attrs });
}

export function getBlockAttrs(id: string): Promise<{ [key: string]: string }> {
    return request("/api/attr/getBlockAttrs", { id });
}

// ************************************ 文件 ************************************

/** 上传 / 创建文件（思源会自动创建父目录） */
export async function putFile(path: string, file: Blob | string): Promise<void> {
    const form = new FormData();
    form.append("path", path);
    form.append("isDir", "false");
    form.append("modTime", Math.floor(Date.now() / 1000).toString());
    const blob = typeof file === "string"
        ? new Blob([file], { type: "image/svg+xml" })
        : file;
    form.append("file", blob, path.split("/").pop());
    const res = await fetch("/api/file/putFile", { method: "POST", body: form });
    const data = (await res.json()) as IWebSocketData;
    if (data.code !== 0) {
        throw new Error(`putFile ${path} -> [${data.code}] ${data.msg}`);
    }
}

export async function createDir(path: string): Promise<void> {
    const form = new FormData();
    form.append("path", path);
    form.append("isDir", "true");
    const res = await fetch("/api/file/putFile", { method: "POST", body: form });
    const data = (await res.json()) as IWebSocketData;
    if (data.code !== 0) {
        throw new Error(`createDir ${path} -> [${data.code}] ${data.msg}`);
    }
}

export interface IDirEntry {
    name: string;
    isDir: boolean;
    updated: number;
}

export function readDir(path: string): Promise<IDirEntry[]> {
    return request<IDirEntry[]>("/api/file/readDir", { path });
}

export function removeFile(path: string) {
    return requestAsync("/api/file/removeFile", { path });
}

export function fileExists(path: string): Promise<boolean> {
    return request<boolean>("/api/file/getFile", { path }).then(
        () => true,
        () => false,
    );
}

// ************************************ 文档树 / 块 ************************************

export interface IBlockRow {
    id: string;
    content: string;
    path: string;
    box: string;
    ial: string;
}

export function sql(stmt: string): Promise<any[]> {
    return request<any[]>("/api/query/sql", { stmt });
}

/** 查询某个笔记本下的所有文档 */
export async function listDocs(notebookId: string): Promise<IconTargetRow[]> {
    const rows = await sql(
        `SELECT id, content, path, box, ial FROM blocks WHERE type = 'd' AND box = '${notebookId}' ORDER BY updated DESC`,
    );
    return rows as IconTargetRow[];
}

/** 查询某篇文档的直接 + 间接子文档 */
export async function listChildDocs(docId: string): Promise<IconTargetRow[]> {
    const rows = await sql(
        `SELECT id, content, path, box, ial FROM blocks WHERE type = 'd' AND path LIKE (SELECT path FROM blocks WHERE id = '${docId}') || '/%' ORDER BY updated DESC`,
    );
    return rows as IconTargetRow[];
}

export interface IconTargetRow extends IBlockRow {
    icon?: string;
}

export function getDocInfo(id: string): Promise<any> {
    return request("/api/block/getDocInfo", { id });
}

export function getHPathByID(id: string): Promise<string> {
    return request("/api/filetree/getHPathByID", { id });
}

// ************************************ 提示 ************************************

export function pushMsg(msg: string, timeout = 5000) {
    return requestAsync("/api/notification/pushMsg", { msg, timeout });
}

export function pushErrMsg(msg: string, timeout = 7000) {
    return requestAsync("/api/notification/pushErrMsg", { msg, timeout });
}

/** 从 ial 字符串中解析 icon 属性 */
export function parseIconFromIal(ial: string): string {
    if (!ial) return "";
    const match = ial.match(/icon="([^"]*)"/);
    return match ? match[1] : "";
}
