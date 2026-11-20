import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { normalizeDB } from '../src/community/db.ts'

/**
 * 后台数据都在 data/dongle.db（SQLite，Node 自带）：账号、登录会话、验证码、邀请码，
 * 社区的笔记、评论、点赞、收藏，以及所有用户行为的流水（events，管理后台实时看的就是它），
 * 网页导入的每个生成任务（import_jobs，进度、日志、结果；见 server/importJobs.ts）。
 * 用户上传的图片在 data/community-media/。线上用 DATA_DIR 指到持久目录。
 */
export const DATA_DIR = process.env.DATA_DIR || 'data'
export const MEDIA_DIR = join(DATA_DIR, 'community-media')

const SCHEMA = `
create table if not exists users (
  id text primary key,
  email text unique,
  name text not null,
  hue integer not null default 0,
  pass text,
  role text not null default 'user',
  status text not null default 'active',
  ban_reason text,
  invite text,
  created_at text not null,
  last_seen text,
  last_ip text,
  last_page text
);
create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  created_at text not null,
  expires_at text not null,
  last_seen text not null,
  ip text,
  ua text
);
create index if not exists sessions_user on sessions(user_id);
create table if not exists codes (
  email text not null,
  purpose text not null,
  hash text not null,
  created_at text not null,
  expires_at text not null,
  attempts integer not null default 0,
  ip text,
  plain text,
  primary key (email, purpose)
);
create table if not exists invites (
  code text primary key,
  note text not null default '',
  max_uses integer not null default 1,
  uses integer not null default 0,
  disabled integer not null default 0,
  created_by text,
  created_at text not null,
  expires_at text
);
create table if not exists posts (
  id text primary key,
  author text not null,
  product text not null,
  kind text not null,
  title text not null,
  body text not null,
  category text not null,
  tags text not null,
  images text not null,
  created_at text not null
);
create index if not exists posts_author on posts(author);
create table if not exists comments (
  id text primary key,
  post_id text not null,
  author text not null,
  text text not null,
  reply_to text,
  created_at text not null
);
create index if not exists comments_post on comments(post_id);
create index if not exists comments_author on comments(author);
create table if not exists likes (
  target text not null,
  user_id text not null,
  created_at text not null,
  primary key (target, user_id)
);
create index if not exists likes_user on likes(user_id);
create table if not exists saves (
  target text not null,
  user_id text not null,
  created_at text not null,
  primary key (target, user_id)
);
create index if not exists saves_user on saves(user_id);
create table if not exists events (
  id integer primary key autoincrement,
  at text not null,
  user_id text,
  kind text not null,
  target text,
  detail text,
  ip text
);
create index if not exists events_user on events(user_id, id);
create table if not exists import_jobs (
  id text primary key,
  owner text not null,
  created_at text not null,
  updated_at text not null,
  status text not null,
  stage text not null,
  name text,
  route text,
  manual_id text,
  file_name text,
  pages integer not null default 0,
  pid integer,
  cancel integer not null default 0,
  data text not null
);
create index if not exists import_jobs_owner on import_jobs(owner, created_at);
create table if not exists kv (
  key text primary key,
  value text not null,
  updated_at text not null
);
create table if not exists trend_items (
  key text primary key,
  name text not null,
  heat integer not null default 0,
  demo integer not null default 0,
  status text not null,
  product text,
  job text,
  post text,
  first_seen text not null,
  last_seen text not null,
  updated_at text not null,
  data text not null
);
create index if not exists trend_items_status on trend_items(status);
create table if not exists trend_scans (
  id text primary key,
  at text not null,
  trigger text not null,
  status text not null,
  finished_at text,
  mode text,
  summary text,
  found integer not null default 0,
  queued integer not null default 0,
  error text,
  data text not null default '{}'
);
create table if not exists trend_brands (
  key text primary key,
  name text not null,
  heat integer not null default 0,
  status text not null default 'active',
  first_seen text not null,
  last_seen text not null,
  updated_at text not null,
  data text not null
);
`

let db: DatabaseSync | null = null

export function sql(): DatabaseSync {
  if (db) return db
  mkdirSync(DATA_DIR, { recursive: true })
  db = new DatabaseSync(join(DATA_DIR, 'dongle.db'))
  db.exec('pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 3000;')
  db.exec(SCHEMA)
  importLegacy(db)
  return db
}

export function closeSql() {
  db?.close()
  db = null
}

export function tx<T>(fn: () => T): T {
  const d = sql()
  d.exec('begin immediate')
  try {
    const out = fn()
    d.exec('commit')
    return out
  } catch (e) {
    d.exec('rollback')
    throw e
  }
}

export const now = () => new Date().toISOString()

export type Row = Record<string, string | number | null>
export const all = <T = Row>(q: string, ...p: (string | number | null)[]) => sql().prepare(q).all(...p) as T[]
export const one = <T = Row>(q: string, ...p: (string | number | null)[]) => sql().prepare(q).get(...p) as T | undefined
export const run = (q: string, ...p: (string | number | null)[]) => sql().prepare(q).run(...p)

/** 零散的设置和状态（热榜设置、调度租约、联网搜索方式……），值存 JSON */
export function getKv<T>(key: string): T | undefined {
  const r = one<{ value: string }>('select value from kv where key = ?', key)
  return r ? (JSON.parse(r.value) as T) : undefined
}
export function setKv(key: string, value: unknown) {
  run('insert into kv (key, value, updated_at) values (?, ?, ?) on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at', key, JSON.stringify(value), now())
}

/** 有账号体系之前，社区数据存在 data/community.json、用户 id 由浏览器生成：第一次启动时搬进库里，作者记成没有邮箱的旧用户 */
function importLegacy(d: DatabaseSync) {
  const file = join(DATA_DIR, 'community.json')
  if (!existsSync(file)) return
  const old = normalizeDB(JSON.parse(readFileSync(file, 'utf8')))
  const at = now()
  d.exec('begin')
  try {
    const user = d.prepare('insert or ignore into users (id, name, hue, created_at) values (?, ?, ?, ?)')
    for (const [id, u] of Object.entries(old.users)) user.run(id, u.name, u.hue, at)
    const post = d.prepare('insert or ignore into posts (id, author, product, kind, title, body, category, tags, images, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    for (const p of old.posts) post.run(p.id, p.author, p.product, p.kind, p.title, p.body, p.category, JSON.stringify(p.tags), JSON.stringify(p.images), p.createdAt)
    const comment = d.prepare('insert or ignore into comments (id, post_id, author, text, reply_to, created_at) values (?, ?, ?, ?, ?, ?)')
    for (const c of old.comments) comment.run(c.id, c.postId, c.author, c.text, c.replyTo ?? null, c.createdAt)
    for (const table of ['likes', 'saves'] as const) {
      const mark = d.prepare(`insert or ignore into ${table} (target, user_id, created_at) values (?, ?, ?)`)
      for (const [target, users] of Object.entries(old[table])) for (const u of users) mark.run(target, u, at)
    }
    d.exec('commit')
  } catch (e) {
    d.exec('rollback')
    throw e
  }
  renameSync(file, `${file}.imported`)
}
