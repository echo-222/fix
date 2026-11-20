/**
 * 站点可以挂在子路径下（线上是 /dongle/，见 vite.config.ts 的 BASE_PATH）。
 * 代码和数据里一律写根路径（/api/…、/models/…、上传图片的 /api/community/media/…），用的时候换成真实地址；
 * data:、blob:、http(s):// 原样返回。
 */
export const withBase = (path: string) =>
  path.startsWith('/') && !path.startsWith('//') ? import.meta.env.BASE_URL + path.slice(1) : path
