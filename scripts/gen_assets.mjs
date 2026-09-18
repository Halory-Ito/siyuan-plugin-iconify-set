// 生成插件 icon.png / preview.png，仅用于打包，不参与插件运行
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

function crc32(buf) {
    let c;
    const table = [];
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0;
        rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }
    return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function createCanvas(width, height) {
    const data = Buffer.alloc(width * height * 4, 0);
    return {
        data,
        width,
        height,
        set(x, y, r, g, b, a = 255) {
            if (x < 0 || y < 0 || x >= width || y >= height) return;
            const i = (y * width + x) * 4;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = a;
        },
        fillRect(x0, y0, w, h, r, g, b, a = 255) {
            for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, r, g, b, a);
        },
        roundRect(x0, y0, w, h, radius, r, g, b, a = 255) {
            for (let y = y0; y < y0 + h; y++) {
                for (let x = x0; x < x0 + w; x++) {
                    const dx = Math.max(x0 + radius - x, 0, x - (x0 + w - 1 - radius));
                    const dy = Math.max(y0 + radius - y, 0, y - (y0 + h - 1 - radius));
                    if (dx * dx + dy * dy <= radius * radius) this.set(x, y, r, g, b, a);
                }
            }
        },
    };
}

function icon() {
    const size = 256;
    const c = createCanvas(size, size);
    for (let y = 0; y < size; y++) {
        const t = y / size;
        c.set(0, y, 0, 0, 0, 0);
        for (let x = 0; x < size; x++) {
            const r = Math.round(30 + 50 * t);
            const g = Math.round(120 + 60 * t);
            const b = Math.round(230 - 40 * t);
            c.set(x, y, r, g, b);
        }
    }
    // 圆角遮罩
    const radius = 56;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = Math.max(radius - x, 0, x - (size - 1 - radius));
            const dy = Math.max(radius - y, 0, y - (size - 1 - radius));
            if (dx * dx + dy * dy > radius * radius) c.set(x, y, 0, 0, 0, 0);
        }
    }
    // 2x2 图标格子
    const cell = 62;
    const gap = 18;
    const start = (size - (cell * 2 + gap)) / 2;
    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
            const x = Math.round(start + col * (cell + gap));
            const y = Math.round(start + row * (cell + gap));
            c.roundRect(x, y, cell, cell, 14, 255, 255, 255, 235);
        }
    }
    return c;
}

function preview() {
    const width = 800;
    const height = 500;
    const c = createCanvas(width, height);
    c.fillRect(0, 0, width, height, 247, 248, 250);
    const ic = icon();
    for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
            const i = (y * 256 + x) * 4;
            if (ic.data[i + 3] > 0) c.set(x + 40, y + 122, ic.data[i], ic.data[i + 1], ic.data[i + 2], ic.data[i + 3]);
        }
    }
    // 右侧模拟文档行
    const rows = 8;
    for (let row = 0; row < rows; row++) {
        const y = 80 + row * 44;
        c.roundRect(380, y, 46, 34, 8, 225, 232, 245);
        c.roundRect(440, y + 8, 220 + ((row * 53) % 120), 8, 4, 205, 212, 224);
        c.roundRect(440, y + 22, 90, 6, 3, 220, 226, 235);
    }
    return c;
}

const outI = icon();
writeFileSync(new URL("../icon.png", import.meta.url), encodePNG(outI.width, outI.height, outI.data));
const outP = preview();
writeFileSync(new URL("../preview.png", import.meta.url), encodePNG(outP.width, outP.height, outP.data));
console.log("generated icon.png and preview.png");
