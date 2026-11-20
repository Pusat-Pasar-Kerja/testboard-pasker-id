import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

export const STORAGE_BACKEND = 'PRIVATE_LOCAL'
export const BUCKET = 'testboard'

/**
 * Private local storage (doc 07): `tmp/` is the quarantine for incoming bytes,
 * `objects/<project>/<yyyy>/<mm>/<uuid>.<ext>` holds released files. Keys never contain
 * user data and are never sent to the browser.
 */
export class LocalStorage {
  readonly root: string
  private readonly tmpDir: string
  private readonly objectsDir: string

  constructor(root: string) {
    this.root = resolve(root)
    this.tmpDir = join(this.root, 'tmp')
    this.objectsDir = join(this.root, 'objects')
  }

  async init(): Promise<void> {
    await mkdir(this.tmpDir, { recursive: true })
    await mkdir(this.objectsDir, { recursive: true })
  }

  tempPath(): string {
    return join(this.tmpDir, `${randomUUID()}.part`)
  }

  newKey(projectId: string, ext: string): string {
    const now = new Date()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    return `${projectId}/${now.getUTCFullYear()}/${month}/${randomUUID()}.${ext}`
  }

  /** Absolute path for a key; refuses anything that would escape the objects folder. */
  pathOf(key: string): string {
    if (!/^[0-9]+\/[0-9]{4}\/[0-9]{2}\/[0-9a-f-]{36}(\.thumb)?\.[a-z0-9.]{1,10}$/.test(key)) {
      throw new Error('Invalid object key')
    }
    const full = resolve(this.objectsDir, key)
    if (!full.startsWith(this.objectsDir + sep)) throw new Error('Invalid object key')
    return full
  }

  /** Write bytes to a key via temp file + rename, so a reader never sees a partial file. */
  async putBytes(key: string, bytes: Buffer): Promise<void> {
    const target = this.pathOf(key)
    await mkdir(dirname(target), { recursive: true })
    const temp = `${target}.${randomUUID()}.tmp`
    await writeFile(temp, bytes, { flag: 'wx' })
    await rename(temp, target)
  }

  /** Release a quarantined file unchanged (copy, then the caller removes the temp file). */
  async putFile(key: string, source: string): Promise<void> {
    const target = this.pathOf(key)
    await mkdir(dirname(target), { recursive: true })
    const temp = `${target}.${randomUUID()}.tmp`
    await copyFile(source, temp)
    await rename(temp, target)
  }

  async size(key: string): Promise<number> {
    return (await stat(this.pathOf(key))).size
  }

  read(key: string, range?: { start: number; end: number }) {
    return createReadStream(this.pathOf(key), range)
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true })
  }

  async removeTemp(path: string): Promise<void> {
    if (resolve(path).startsWith(this.tmpDir + sep)) await rm(path, { force: true })
  }

  /** Startup: quarantine leftovers from an interrupted process are never released. */
  async clearTemp(): Promise<void> {
    await rm(this.tmpDir, { recursive: true, force: true })
    await mkdir(this.tmpDir, { recursive: true })
  }
}
