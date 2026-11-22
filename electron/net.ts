import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const UA = 'QidonqiLauncher/0.1.0'

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} · ${url}`)
  return (await res.json()) as T
}

export async function fetchText(url: string, headers?: Record<string, string>): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...(headers ?? {}) } })
  if (!res.ok) throw new Error(`HTTP ${res.status} · ${url}`)
  return await res.text()
}

export async function fileExists(file: string): Promise<boolean> {
  try {
    await fsp.access(file)
    return true
  } catch {
    return false
  }
}

export interface DownloadJob {
  url: string
  dest: string
  size?: number
  label?: string
}

export interface DownloaderOptions {
  concurrency?: number
  onItemDone?: (job: DownloadJob, index: number) => void
  signal?: AbortSignal
}

/**
 * 下载单个文件，带两次重试与进度回调。
 */
export async function downloadFile(
  url: string,
  dest: string,
  onBytes?: (received: number, total: number) => void,
): Promise<void> {
  await fsp.mkdir(path.dirname(dest), { recursive: true })
  const tmp = `${dest}.part`
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const total = Number(res.headers.get('content-length') ?? 0)
      let received = 0
      const stream = Readable.fromWeb(res.body as never)
      stream.on('data', (chunk: Buffer) => {
        received += chunk.length
        onBytes?.(received, total)
      })
      await pipeline(stream, fs.createWriteStream(tmp))
      await fsp.rename(tmp, dest)
      return
    } catch (error) {
      lastError = error
      await fsp.rm(tmp, { force: true }).catch(() => undefined)
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('下载失败')
}

export async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const workers = new Array(Math.max(1, Math.min(limit, items.length))).fill(0).map(async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      await worker(items[index], index)
    }
  })
  await Promise.all(workers)
}

/**
 * 批量下载，已存在的文件按大小判断跳过。
 */
export async function downloadBatch(
  jobs: DownloadJob[],
  options: DownloaderOptions & { onProgress?: (done: number, total: number) => void },
): Promise<void> {
  const concurrency = options.concurrency ?? 16
  let done = 0
  await runPool(jobs, concurrency, async (job, index) => {
    const exists = await fileExists(job.dest)
    const stat = exists ? await fsp.stat(job.dest) : null
    const sizeOk = !job.size || stat?.size === job.size
    if (exists && sizeOk) {
      done += 1
      options.onProgress?.(done, jobs.length)
      return
    }
    await downloadFile(job.url, job.dest)
    done += 1
    options.onProgress?.(done, jobs.length)
    options.onItemDone?.(job, index)
  })
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf8')
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fsp.readFile(file, 'utf8')) as T
}
