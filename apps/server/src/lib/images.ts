import { badRequest } from './errors';

export type ImageType = 'jpg' | 'png';

/** Identify by magic bytes — never trust the client's declared content type. */
export function sniffImage(buf: Buffer): ImageType | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}

/**
 * Removes metadata that can identify the uploader — above all the GPS position
 * phones embed in photos. JPEG: drops APP1–APP15 (EXIF, XMP, …) and COM segments,
 * keeping APP0 (JFIF) and everything needed to decode. PNG: drops eXIf/tEXt/zTXt/iTXt/tIME chunks.
 */
export function stripMetadata(buf: Buffer, type: ImageType): Buffer {
  return type === 'jpg' ? stripJpeg(buf) : stripPng(buf);
}

function stripJpeg(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) throw badRequest('invalid_image');
    const marker = buf[i + 1]!;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(buf.subarray(i, i + 2)); // standalone markers
      i += 2;
      continue;
    }
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) throw badRequest('invalid_image');
    const isMeta = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMeta) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
    if (marker === 0xda) {
      out.push(buf.subarray(i)); // start of scan: the rest is entropy-coded image data + EOI
      return Buffer.concat(out);
    }
  }
  throw badRequest('invalid_image');
}

const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    const end = i + 12 + len;
    if (end > buf.length) throw badRequest('invalid_image');
    if (!PNG_DROP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') return Buffer.concat(out);
  }
  throw badRequest('invalid_image');
}
