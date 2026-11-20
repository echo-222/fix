import { useEffect } from 'react'
import { create } from 'zustand'
import { JOB_KEY, dismissedJobs, jobImageUrl, jobStages, listManualJobs, type JobBrief } from '../../ai/manualImport'
import { IMPORTED } from '../../domain/manual/library/imported'
import { timeAgo } from '../../community/store'
import { useApp } from '../../store'

/**
 * 「我的 · 导入」里的生成任务卡片：还在生成的、页面打开之后才生成好的（还没载入成草稿）、没成功且还没看过原因的。
 * 点一下打开导入弹窗，接着显示这个任务的进度（任务在服务器上跑，弹窗只是轮询）。
 */
export const useImportJobs = create<{ jobs: JobBrief[]; load: () => Promise<void> }>()((set) => ({
  jobs: [],
  load: async () => {
    try {
      const all = await listManualJobs()
      const loaded = new Set(IMPORTED.map((m) => m.id))
      const dismissed = dismissedJobs()
      set({ jobs: all.filter((j) => j.status === 'running' || (!dismissed.has(j.id) && !(j.manualId && loaded.has(j.manualId)))) })
    } catch {
      // 没登录、静态部署没有接口：不显示任务
    }
  },
}))

/** 在「我的」里时轮询：有任务在跑 3 秒一次，否则 20 秒一次 */
export function useJobPolling(active: boolean) {
  const running = useImportJobs((s) => s.jobs.some((j) => j.status === 'running'))
  useEffect(() => {
    if (!active) return
    const { load } = useImportJobs.getState()
    load()
    const t = setInterval(load, running ? 3000 : 20000)
    return () => clearInterval(t)
  }, [active, running])
}

export function openJob(id: string) {
  sessionStorage.setItem(JOB_KEY, id)
  if (!useApp.getState().importOpen) useApp.getState().toggle('importOpen')
}

const elapsed = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

function JobCard({ job }: { job: JobBrief }) {
  const stages = jobStages(job)
  const at = Math.max(0, stages.findIndex(([s]) => s === job.stage))
  const running = job.status === 'running'
  const failed = job.status === 'error' || job.status === 'cancelled' || (job.status === 'done' && job.kind !== 'scene')
  const title = job.name || job.route?.subject || job.input?.fileName || '新的导入'
  const status = running
    ? `${stages[at]?.[1] ?? '准备中'} · ${at + 1}/${stages.length}`
    : job.status === 'cancelled' ? '已取消'
      : job.kind === 'not_manual' ? '没认出能做成 3D 的内容'
        : job.kind === 'parametric_desk' ? '型材家具，可转参数化'
          : failed ? '没生成成功，点开看原因' : '生成好了，点开查看'
  return (
    <button className={`job-card is-${running ? 'running' : failed ? 'failed' : 'done'}`} onClick={() => openJob(job.id)} title={running ? '回到生成进度' : '查看这次生成'}>
      <span className="job-thumb" aria-hidden>
        {!!job.input?.pages && <img src={jobImageUrl(job.id)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />}
        {running && <i className="job-spin" />}
      </span>
      <span className="job-text">
        <b>{title}</b>
        <small className="job-status">{running && <i className="job-dot" />}{status}</small>
        {running && <span className="job-bar"><i style={{ width: `${Math.round(((at + 0.5) / stages.length) * 100)}%` }} /></span>}
        <small className="job-meta">
          {job.route?.label ? `${job.route.label} · ` : ''}
          {running ? `已用 ${elapsed(Date.now() - job.created)}` : timeAgo(new Date(job.finished ?? job.created).toISOString())}
        </small>
      </span>
    </button>
  )
}

export function ImportJobs({ floating }: { floating?: boolean }) {
  const jobs = useImportJobs((s) => s.jobs)
  if (!jobs.length) return null
  return (
    <section className={`import-jobs ${floating ? 'is-floating' : ''}`} aria-label="生成中的导入">
      {jobs.map((j) => <JobCard key={j.id} job={j} />)}
    </section>
  )
}
