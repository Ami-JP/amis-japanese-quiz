import crypto from 'crypto'
import { cookies } from 'next/headers'

function sign(value: string) {
  const secret = process.env.TEACHER_COOKIE_SECRET || ''
  return crypto.createHmac('sha256', secret).update(value).digest('hex')
}

export function createTeacherCookieValue() {
  const payload = JSON.stringify({
    sub: 'teacher',
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  })

  const base = Buffer.from(payload).toString('base64url')
  const signature = sign(base)
  return `${base}.${signature}`
}

export async function verifyTeacherSession() {
  const cookieStore = await cookies()
  const raw = cookieStore.get('teacher_session')?.value
  if (!raw) return false

  const [base, signature] = raw.split('.')
  if (!base || !signature) return false

  const expected = sign(base)
  if (expected !== signature) return false

  const payload = JSON.parse(Buffer.from(base, 'base64url').toString('utf8'))
  if (!payload?.exp || Date.now() > payload.exp) return false

  return payload.sub === 'teacher'
}