// Copy of tests/security/http/zip.ts so web unit tests stay inside the Docker build context.
import { deflateRawSync } from 'node:zlib';

/** Minimal ZIP writer (deflate, no data descriptor) for upload attack fixtures. Test use only. */
export interface Girdi {
  name: string;
  data: Buffer;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = (crcTable[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(entries: Girdi[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const packed = deflateRawSync(e.data, { level: 9 });
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const CT = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const doc = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;

/** A valid, tiny DOCX (control case). */
export const kucukDocx = () =>
  zip([
    { name: '[Content_Types].xml', data: Buffer.from(CT) },
    {
      name: 'word/document.xml',
      data: Buffer.from(doc('<w:p><w:r><w:t>Kalite deneme metni.</w:t></w:r></w:p>')),
    },
  ]);

/** Zip bomb shaped as DOCX: document.xml expands to `mb` megabytes of zeros (plan 5.6/4). */
export const bombaDocx = (mb = 300) =>
  zip([
    { name: '[Content_Types].xml', data: Buffer.from(CT) },
    { name: 'word/document.xml', data: Buffer.alloc(mb * 1024 * 1024, 0x20) },
  ]);

/** DOCX with a very large number of entries (entry count limit, plan 5.6/4). */
export const cokGirdiliDocx = (n = 20_000) =>
  zip([
    { name: '[Content_Types].xml', data: Buffer.from(CT) },
    { name: 'word/document.xml', data: Buffer.from(doc('<w:p/>')) },
    ...Array.from({ length: n }, (_, i) => ({ name: `word/media/x${i}.bin`, data: Buffer.from('x') })),
  ]);

/** XML entity expansion ("billion laughs") inside document.xml. */
export const xxeDocx = () =>
  zip([
    { name: '[Content_Types].xml', data: Buffer.from(CT) },
    {
      name: 'word/document.xml',
      data: Buffer.from(
        `<?xml version="1.0"?><!DOCTYPE d [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;"><!ENTITY d "&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;"><!ENTITY e "&d;&d;&d;&d;&d;&d;&d;&d;&d;&d;"><!ENTITY f "&e;&e;&e;&e;&e;&e;&e;&e;&e;&e;"><!ENTITY x SYSTEM "file:///etc/passwd">]><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>&f;&x;</w:t></w:r></w:p></w:body></w:document>`,
      ),
    },
  ]);

/** Path traversal entry names (zip slip). */
export const zipSlipDocx = () =>
  zip([
    { name: '[Content_Types].xml', data: Buffer.from(CT) },
    { name: 'word/document.xml', data: Buffer.from(doc('<w:p/>')) },
    { name: '../../../../tmp/kazuist-zip-slip.txt', data: Buffer.from('slip') },
  ]);
