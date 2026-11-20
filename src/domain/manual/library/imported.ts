import type { ManualSpec } from '../types'

/** 菜单里网页导入的说明书统一放在这一组 */
export const IMPORTED_CATEGORY = '我导入的说明书'

/**
 * 网页上传说明书生成的场景脚本（/imported/<id>/spec.json，服务器按账号过滤，见 server/imports.ts）；
 * main.tsx 在加载 App 之前填好（没登录时取不到，登录后再取一次）
 */
export const IMPORTED: ManualSpec[] = []

/** AI 识别出的原始品类（菜单里统一归到 IMPORTED_CATEGORY，首页按它归大类） */
export const IMPORTED_AS = new Map<string, string>()

/** 不算自己的：管理员看得到的别人导入的、已被删掉的。能打开，但不进首页和「我的 · 导入」 */
export const IMPORTED_FOREIGN = new Set<string>()

export async function loadImported(base = import.meta.env.BASE_URL) {
  try {
    const r = await fetch(`${base}imported/index.json`, { cache: 'no-store' })
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) return
    IMPORTED.length = 0
    IMPORTED_AS.clear()
    IMPORTED_FOREIGN.clear()
    const { manuals } = (await r.json()) as { manuals: { id: string; mine?: boolean }[] }
    for (const m of manuals) if (m.mine === false) IMPORTED_FOREIGN.add(m.id)
    const specs = await Promise.all(
      manuals.map((m) =>
        fetch(`${base}imported/${m.id}/spec.json`, { cache: 'no-store' })
          .then((res) => (res.ok ? (res.json() as Promise<ManualSpec>) : null))
          .catch(() => null),
      ),
    )
    for (const s of specs) {
      if (!s?.id || !Array.isArray(s.parts) || !Array.isArray(s.guides)) continue
      if (s.category && s.category !== IMPORTED_CATEGORY) IMPORTED_AS.set(s.id, s.category)
      IMPORTED.push({ ...s, category: IMPORTED_CATEGORY })
    }
  } catch {
    // 没有导入过说明书，或者静态部署没带 imported/
  }
}
