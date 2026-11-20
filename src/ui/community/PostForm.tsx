import { useMemo, useRef, useState } from 'react'
import { compressImage } from '../../ai/manual'
import { LIMITS, type Post } from '../../community/db'
import { DIY_CATEGORY, LIBRARY_POSTS } from '../../community/seed'
import { useCommunity, useFeed } from '../../community/store'
import { CATEGORY_ORDER } from '../../domain/manual/library'
import { IMPORTED_CATEGORY } from '../../domain/manual/library/imported'
import { IconClose, IconImage } from '../icons'

export const POST_CATEGORIES = [...CATEGORY_ORDER.filter((c) => c !== IMPORTED_CATEGORY), DIY_CATEGORY, '其他']

/** 按品类分组的说明书，给「关联的说明书」下拉框用 */
function groupedProducts() {
  const groups = new Map<string, typeof LIBRARY_POSTS>()
  for (const p of LIBRARY_POSTS) {
    if (p.foreign) continue
    const g = p.draft ? IMPORTED_CATEGORY : p.category
    groups.set(g, [...(groups.get(g) ?? []), p])
  }
  return [...groups.entries()]
}

interface Props {
  product?: string
  /** 网页导入流程：说明书固定，作为一份 3D 说明书发布 */
  lockProduct?: boolean
  kind?: Post['kind']
  defaultTitle?: string
  submitLabel?: string
  onCancel?: () => void
  onDone: (id: string) => void
}

export function PostForm({ product: initial, lockProduct, kind: forcedKind, defaultTitle, submitLabel, onCancel, onDone }: Props) {
  const feed = useFeed()
  const publish = useCommunity((s) => s.publish)
  const groups = useMemo(groupedProducts, [])
  const [product, setProduct] = useState(initial ?? '')
  const lib = LIBRARY_POSTS.find((p) => p.product === product)
  const published = feed.some((p) => p.kind === 'manual' && !p.official && !p.draft && p.product === product)
  // 本机导入、还没发布过的说明书：这次发布就是把说明书本身发出去
  const kind: Post['kind'] = forcedKind ?? (lib?.draft && !published ? 'manual' : 'note')
  const needCategory = !lib || !!lib.draft
  // 本机导入的先填 AI 识别的品类，可以改
  const suggested = lib?.draft && lib.category !== IMPORTED_CATEGORY ? lib.category : '其他'
  const [picked, setCategory] = useState<string>()
  const category = picked ?? suggested
  const [title, setTitle] = useState(defaultTitle ?? (lib?.draft ? lib.title : ''))
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const addImages = async (files: FileList | null) => {
    if (!files) return
    const pics = await Promise.all([...files].filter((f) => f.type.startsWith('image/')).map((f) => compressImage(f, 1400)))
    setImages((prev) => [...prev, ...pics].slice(0, LIMITS.images))
  }

  const submit = async () => {
    if (!product || !title.trim() || busy) return
    setBusy(true)
    try {
      const cat = needCategory ? category : lib!.category
      const extra = tags.split(/[\s,，#]+/).filter(Boolean)
      const id = await publish({
        product, kind, title, body, category: cat, images,
        tags: [cat, ...(kind === 'manual' ? ['3D 说明书'] : ['使用笔记']), ...extra],
      })
      onDone(id)
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="post-form">
      {lockProduct ? null : (
        <label className="form-field">
          <span>关联的 3D 说明书</span>
          <select value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="" disabled>选一份说明书，点开笔记就能看 3D 演示</option>
            {groups.map(([cat, list]) => (
              <optgroup key={cat} label={cat}>
                {list.map((p) => <option key={p.product} value={p.product}>{p.title}{p.draft ? '（未发布）' : ''}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      {kind === 'manual' && !lockProduct && (
        <div className="notice">这份说明书是你导入的，还没发布；发布后大家都能在首页看到它的 3D 演示。</div>
      )}
      {needCategory && product && (
        <label className="form-field">
          <span>分类</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {[...new Set([suggested, ...POST_CATEGORIES])].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      )}
      <label className="form-field">
        <span>标题 <small>{title.length}/{LIMITS.title}</small></span>
        <input
          value={title} maxLength={LIMITS.title} onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === 'manual' ? '例如：XX 洗碗机第一次使用全流程' : '例如：滤芯到期提醒怎么复位'}
        />
      </label>
      <label className="form-field">
        <span>正文 <small>{body.length}/{LIMITS.body}</small></span>
        <textarea
          value={body} maxLength={LIMITS.body} rows={5} onChange={(e) => setBody(e.target.value)}
          placeholder={kind === 'manual' ? '介绍一下这份说明书：型号、覆盖了哪些步骤、需要注意什么' : '分享技巧、避坑经验或者故障是怎么解决的。可以写「第 3 步」，大家对照 3D 演示看'}
        />
      </label>
      <div className="form-field">
        <span>图片 <small>{images.length}/{LIMITS.images} · 可选</small></span>
        <div className="form-images">
          {images.map((src, i) => (
            <div className="thumb" key={i}>
              <img src={src} alt={`图片 ${i + 1}`} />
              <button type="button" onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label="移除"><IconClose width={12} height={12} /></button>
            </div>
          ))}
          {images.length < LIMITS.images && (
            <button type="button" className="thumb-add" onClick={() => fileRef.current?.click()}>
              <IconImage />
              <small>添加图片</small>
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addImages(e.target.files); e.target.value = '' }} />
      </div>
      <label className="form-field">
        <span>话题 <small>空格分隔 · 可选</small></span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="例如：新手 避坑 滤芯" />
      </label>
      <div className="form-actions">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>取消</button>}
        <button type="button" className="btn primary" disabled={!product || !title.trim() || busy} onClick={submit}>
          {busy ? '发布中…' : submitLabel ?? '发布'}
        </button>
      </div>
    </div>
  )
}
