import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IMPORT_WORK_DIR, readIndex } from './imports.ts'
import type { Job } from './manualPipeline.ts'
import { ROUTES, type Route } from './skillRouter.ts'
import { all, one, run } from './sql.ts'

/**
 * 网页导入的生成任务存进 import_jobs（data/dongle.db）：跑的时候每 2 秒写一次（兼作心跳），结束时再写一次。
 * 进程重启、开发时 Vite 重载换了模块实例都不丢——进度、日志、结果都能从库里读：
 * 「我的 · 导入」列自己还在跑的和最近结束的，管理后台列所有人的全部任务。
 * 上传的原页、产品照片和中间产物在 IMPORT_WORK_DIR/<任务号>/（pages/、photos/、转写稿、每轮脚本）。
 */

/** 心跳这么久没更新，或者不是当前进程起的，就当任务已经中断（服务器重启 / 崩溃） */
const STALE_MS = 90_000

interface JobRow {
  id: string
  owner: string
  created_at: string
  updated_at: string
  status: string
  stage: string
  pid: number | null
  cancel: number
  data: string
}

export function saveJob(job: Job, pid: number | null = process.pid) {
  run(
    `insert into import_jobs (id, owner, created_at, updated_at, status, stage, name, route, manual_id, file_name, pages, pid, data)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(id) do update set updated_at = excluded.updated_at, status = excluded.status, stage = excluded.stage, name = excluded.name,
       route = excluded.route, manual_id = excluded.manual_id, pid = excluded.pid, data = excluded.data`,
    job.id, job.owner, new Date(job.created).toISOString(), new Date(pid ? Date.now() : job.created).toISOString(), job.status, job.stage,
    job.name ?? null, job.route?.verdict ?? null, job.manualId ?? null, job.input?.fileName ?? null, job.input?.pages ?? 0, pid, JSON.stringify(job),
  )
}

const alive = (r: Pick<JobRow, 'status' | 'pid' | 'updated_at'>) =>
  r.status === 'running' && r.pid === process.pid && Date.now() - Date.parse(r.updated_at) < STALE_MS

/** 库里标着 running、其实已经没人在跑的，改成中断并写回 */
function revive(r: JobRow): Job {
  const job = JSON.parse(r.data) as Job
  if (r.status !== 'running' || alive(r)) return job
  job.status = 'error'
  job.detail = undefined
  job.error = job.manualId ? '服务器重启过，任务中断了；中断前已经保存了一版，可以打开看' : '服务器重启过，任务中断了，重新上传再生成一次'
  job.log.push({ t: Date.now() - job.created, msg: job.error, level: 'error' })
  run("update import_jobs set status = 'error', data = ? where id = ?", JSON.stringify(job), r.id)
  return job
}

export function loadJob(id: string): Job | undefined {
  const r = one<JobRow>('select * from import_jobs where id = ?', id)
  return r ? revive(r) : undefined
}

/** 正在跑的任务数；给了 owner 就只数这个人的 */
export function runningCount(owner?: string) {
  const rows = owner
    ? all<JobRow>("select status, pid, updated_at from import_jobs where status = 'running' and owner = ?", owner)
    : all<JobRow>("select status, pid, updated_at from import_jobs where status = 'running'")
  return rows.filter(alive).length
}

/** 跑这个任务的不一定是收到取消请求的模块实例（开发时 Vite 重载过）：记在库里，由心跳去取消 */
export function requestCancel(id: string) {
  const r = one<JobRow>('select status, pid, updated_at from import_jobs where id = ?', id)
  if (!r || !alive(r)) return false
  run('update import_jobs set cancel = 1 where id = ?', id)
  return true
}

export const cancelRequested = (id: string) => !!one<{ cancel: number }>('select cancel from import_jobs where id = ?', id)?.cancel

/** 列表用的摘要：不带日志 */
export function brief(job: Job) {
  const { log: _log, warnings: _warnings, problems, summary: _summary, models, ...rest } = job
  return { ...rest, problems: problems.length, models: models?.filter((m) => m.ok).length ?? 0 }
}

/** 「我的 · 导入」：自己还在跑的，和最近一天结束的 */
export function myJobs(owner: string) {
  const since = new Date(Date.now() - 86400_000).toISOString()
  return all<JobRow>("select * from import_jobs where owner = ? and (status = 'running' or updated_at > ?) order by created_at desc limit 20", owner, since)
    .map((r) => brief(revive(r)))
}

type WithUser = JobRow & { user_name: string | null; email: string | null }
const WITH_USER = 'select j.*, u.name user_name, u.email from import_jobs j left join users u on u.id = j.owner'

/** 管理后台：所有人的全部任务，新的在前；导入的说明书被用户删了的标出来 */
export function allJobs(limit = 1000) {
  backfill()
  const deleted = new Map(readIndex().manuals.filter((m) => m.deleted).map((m) => [m.id, m.deleted!]))
  return all<WithUser>(`${WITH_USER} order by j.created_at desc limit ?`, limit).map((r) => {
    const job = brief(revive(r))
    return { ...job, ownerName: r.user_name, ownerEmail: r.email, deleted: job.manualId ? deleted.get(job.manualId) ?? null : null }
  })
}

const PAGE = /^\d+\.(jpg|png|webp)$/
const FILE = /^[\w.-]+\.(json|txt)$/

/** 任务目录里存的上传图：pages = 原页，photos = 产品照片 */
export function imageFiles(id: string, dir: 'pages' | 'photos') {
  const d = join(IMPORT_WORK_DIR, id, dir)
  return existsSync(d) ? readdirSync(d).filter((f) => PAGE.test(f)).sort() : []
}

/** 任务目录里的中间产物（转写稿、每轮脚本、审计结果、模型原始回复） */
export function workFiles(id: string) {
  const d = join(IMPORT_WORK_DIR, id)
  return existsSync(d) ? readdirSync(d).filter((f) => FILE.test(f)).sort() : []
}

export const workFile = (id: string, name: string) => (/^[\w-]+$/.test(id) && FILE.test(name) ? join(IMPORT_WORK_DIR, id, name) : null)

export function jobDetail(id: string) {
  backfill()
  const r = one<WithUser>(`${WITH_USER} where j.id = ?`, id)
  if (!r) return undefined
  const job = revive(r)
  const entry = readIndex().manuals.find((m) => (job.manualId ? m.id === job.manualId : m.job === id))
  return {
    job, ownerName: r.user_name, ownerEmail: r.email,
    pages: imageFiles(id, 'pages').length, photos: imageFiles(id, 'photos').length, files: workFiles(id),
    imported: entry ? { id: entry.id, name: entry.name, deleted: entry.deleted ?? null, deletedBy: entry.deletedBy ?? null } : null,
  }
}

let filled = false

/** 有任务表之前的导入：按中间产物目录和导入清单补登记（每个进程只做一次） */
export function backfill() {
  if (filled) return
  filled = true
  const known = new Set(all<{ id: string }>('select id from import_jobs').map((r) => r.id))
  const index = readIndex().manuals
  const dirs = existsSync(IMPORT_WORK_DIR) ? readdirSync(IMPORT_WORK_DIR).filter((d) => /^\d{14}-[a-z0-9]{4}$/.test(d)) : []
  const ids = new Set([...dirs, ...index.map((e) => e.job).filter(Boolean)])
  for (const id of ids) {
    if (known.has(id)) continue
    const read = (f: string) => {
      try {
        return JSON.parse(readFileSync(join(IMPORT_WORK_DIR, id, f), 'utf8'))
      } catch {
        return undefined
      }
    }
    const input = read('input.json') ?? {}
    const verdict = read('classify.json')
    const entry = index.find((e) => e.job === id)
    const ok = !!entry || existsSync(join(IMPORT_WORK_DIR, id, 'spec-final.json'))
    const t = id.match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/)
    const created = t ? Date.UTC(+t[1], +t[2] - 1, +t[3], +t[4], +t[5], +t[6]) : Date.parse(entry?.created ?? '') || Date.now()
    const info = verdict?.route ? ROUTES[verdict.route as Route] : undefined
    saveJob({
      id, owner: entry?.owner ?? '', created, status: ok ? 'done' : 'error', stage: 'done', log: [], model: '',
      usage: { input: 0, output: 0, cached: 0, calls: 0 }, review: !!input.review, appearance: !!input.appearance, problems: [], warnings: [],
      name: entry?.name ?? read('transcript.json')?.product?.name, manualId: entry?.id, kind: entry ? 'scene' : undefined,
      route: verdict ? { verdict: verdict.verdict, label: info?.label ?? verdict.verdict, skill: info?.skill, confidence: verdict.confidence ?? 0, subject: verdict.subject ?? '', reason: verdict.reason ?? '' } : undefined,
      input: { fileName: input.fileName, pages: Number(input.pages) || 0, photos: Number(input.photos) || 0, hint: input.hint },
      error: ok ? undefined : '早期任务，没有留下结果记录', legacy: true,
    }, null)
  }
}
