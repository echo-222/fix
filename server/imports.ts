import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { SCRIPT_USER, type Me } from './auth.ts'
import { send, type Req, type Res } from './http.ts'
import { one } from './sql.ts'

/**
 * 网页导入的说明书存在哪、谁能看。
 *   IMPORT_DIR：<id>/spec.json、原页图 pNN.jpg、外观模型 models/*.glb，清单 index.json。默认 public/imported（本地开发）；
 *     线上指到持久目录（/var/lib/dongle/imported），不随版本走。
 *   IMPORT_WORK_DIR：每个任务的中间产物（转写、每轮脚本、截图），排查用。默认 manuals-src/imports。
 * 浏览器拿的 /imported/* 都经过 importedRoutes：没发布的说明书只有导入的人（和管理员）看得到，发布以后大家都能看。
 * 用户删除只是在清单里标 deleted，文件留着：导入的人和别人都看不到了，管理员还能在后台打开。
 */
export const IMPORT_DIR = resolve(process.env.IMPORT_DIR || join('public', 'imported'))
export const IMPORT_WORK_DIR = resolve(process.env.IMPORT_WORK_DIR || join('manuals-src', 'imports'))
const INDEX = join(IMPORT_DIR, 'index.json')

export interface ImportEntry {
  id: string
  name: string
  created: string
  job: string
  /** 导入的人（用户 id）；本地开发时导入的旧条目没有，当作大家都能看 */
  owner?: string
  /** 用户删除的时间和操作人：只有管理员还看得到 */
  deleted?: string
  deletedBy?: string
}

export function readIndex(): { manuals: ImportEntry[] } {
  return existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : { manuals: [] }
}

export function writeIndex(index: { manuals: ImportEntry[] }) {
  writeFileSync(INDEX, JSON.stringify(index, null, 2) + '\n')
}

/** 导入的人自己发布过就是公开的（别人拿草稿的 id 发笔记不算，不然猜到 id 就能把别人的草稿公开） */
const published = (entry: ImportEntry) =>
  !!one("select 1 from posts where product = ? and kind = 'manual' and author = ? limit 1", `manual:${entry.id}`, entry.owner ?? '')

/** 改、删：导入的人或管理员 */
export const mayEdit = (entry: ImportEntry, me: Me) => !entry.owner || entry.owner === me.id || me.role === 'admin'

/** 截图脚本（SCRIPT_USER）要能打开刚导入、还没发布的说明书 */
const canSee = (entry: ImportEntry, me: Me) =>
  entry.deleted ? me.role === 'admin' : mayEdit(entry, me) || me.id === SCRIPT_USER.id || published(entry)

/** 算在「我的 · 导入」里的：自己导入、没删的（管理员看得到别人的，但那些不是自己的） */
const isMine = (entry: ImportEntry, me: Me) => !entry.deleted && (!entry.owner || entry.owner === me.id)

const TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
}

/** GET /imported/index.json（只列看得到的）、/imported/<id>/<文件>、/imported/<id>/models/<文件> */
export function importedRoutes(req: Req, res: Res, path: string, me: Me | null) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'GET only' })
  if (!me) return send(res, 401, { error: '请先登录' })
  const index = readIndex()
  if (path === '/imported/index.json') {
    return send(res, 200, { manuals: index.manuals.filter((m) => canSee(m, me)).map((m) => ({ ...m, mine: isMine(m, me) })) })
  }
  const m = path.match(/^\/imported\/([a-z0-9-]+)\/((?:models\/)?[\w-]+\.[a-z]+)$/)
  const entry = m && index.manuals.find((e) => e.id === m[1])
  const file = m ? join(IMPORT_DIR, m[1], m[2]) : ''
  if (!entry || !canSee(entry, me) || !file.startsWith(IMPORT_DIR + sep) || !TYPES[extname(file)] || !existsSync(file)) {
    return send(res, 404, { error: 'not found' })
  }
  const stat = statSync(file)
  const modified = stat.mtime.toUTCString()
  res.setHeader('Last-Modified', modified)
  res.setHeader('Cache-Control', 'private, no-cache')
  if (req.headers['if-modified-since'] === modified) {
    res.statusCode = 304
    return res.end()
  }
  res.setHeader('Content-Type', TYPES[extname(file)])
  res.setHeader('Content-Length', stat.size)
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}
