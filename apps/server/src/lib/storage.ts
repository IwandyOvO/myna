import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ImageType } from './images';

/** Object storage seam. LocalDiskStorage is for development; production should use S3/R2 behind a CDN (spec §11). */
export interface Storage {
  /** Saves an image and returns its public path, e.g. "/uploads/<uuid>.jpg". */
  putImage(data: Buffer, type: ImageType): Promise<string>;
  exists(path: string): Promise<boolean>;
  read(name: string): Promise<Buffer | null>;
}

export const UPLOAD_PATH = /^\/uploads\/[0-9a-f-]{36}\.(jpg|png)$/;

export class LocalDiskStorage implements Storage {
  constructor(private dir: string) {}

  async putImage(data: Buffer, type: ImageType) {
    await mkdir(this.dir, { recursive: true });
    const name = `${randomUUID()}.${type}`;
    await writeFile(join(this.dir, name), data);
    return `/uploads/${name}`;
  }

  async exists(path: string) {
    if (!UPLOAD_PATH.test(path)) return false;
    try {
      return (await stat(join(this.dir, path.slice('/uploads/'.length)))).isFile();
    } catch {
      return false;
    }
  }

  async read(name: string) {
    if (!UPLOAD_PATH.test(`/uploads/${name}`)) return null;
    try {
      return await readFile(join(this.dir, name));
    } catch {
      return null;
    }
  }
}
