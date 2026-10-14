// Gera tests/fixtures/assinatura.png: traço escuro sobre fundo branco (300×100).
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const W = 300;
const H = 100;
const raw = Buffer.alloc((W * 4 + 1) * H, 255);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const wave = 50 + 28 * Math.sin(x / 14) * Math.cos(x / 47);
    const d = Math.abs(y - wave);
    if (x > 20 && x < 280 && d < 3) {
      const o = y * (W * 4 + 1) + 1 + x * 4;
      const v = d < 2 ? 20 : 150;
      raw[o] = v; raw[o + 1] = v; raw[o + 2] = Math.min(255, v + 60); raw[o + 3] = 255;
    }
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'assinatura.png'), png);
console.log('assinatura.png', png.length, 'bytes');
