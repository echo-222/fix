import nodemailer, { type Transporter } from 'nodemailer'
import type { Env } from './http.ts'

/**
 * 验证码邮件走 SMTP（阿里云邮件推送、腾讯企业邮、QQ / 163 邮箱都行）。
 * 云服务器一般封了 25 端口，用 465（SSL）。没配置时验证码只打印在服务器日志里，
 * 线上还会显示在管理后台「待转发验证码」，内测初期可以由管理员转告。
 */
export const mailConfigured = (env: Env) => !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS)

let transport: Transporter | null = null

function transporter(env: Env) {
  if (transport) return transport
  const port = Number(env.SMTP_PORT || 465)
  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })
  return transport
}

const PURPOSE = { register: '注册', reset: '重设密码' } as const
export type CodePurpose = keyof typeof PURPOSE

export async function sendCodeMail(env: Env, to: string, code: string, purpose: CodePurpose) {
  const what = PURPOSE[purpose]
  const from = env.MAIL_FROM || `懂了 Dongle <${env.SMTP_USER}>`
  await transporter(env).sendMail({
    from,
    to,
    subject: `懂了 Dongle ${what}验证码：${code}`,
    text: `你的${what}验证码是 ${code}，10 分钟内有效。\n如果不是你本人操作，忽略这封邮件即可。\n\n懂了 Dongle · 看得懂的 3D 说明书社区`,
    html: `<div style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:420px;margin:0 auto;padding:28px 24px;color:#161616">
  <div style="font-size:18px;font-weight:900;letter-spacing:2px">懂了 <span style="font-size:12px;color:#a8a8a8;letter-spacing:1px">Dongle</span></div>
  <p style="margin:22px 0 8px;font-size:14px">你的${what}验证码：</p>
  <div style="display:inline-block;padding:12px 18px;border-radius:12px;background:#f8e8a8;font:800 28px/1 'SF Mono',Menlo,monospace;letter-spacing:6px">${code}</div>
  <p style="margin:16px 0 0;font-size:12px;color:#6b6b6b">10 分钟内有效。如果不是你本人操作，忽略这封邮件即可。</p>
  <p style="margin:28px 0 0;font-size:11px;color:#a8a8a8">懂了 Dongle · 看得懂的 3D 说明书社区</p>
</div>`,
  })
}
