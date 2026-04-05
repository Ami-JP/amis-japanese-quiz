import { NextResponse } from 'next/server'
import { createTeacherCookieValue } from '@/lib/auth/teacher'

export async function POST(req: Request) {
  const { loginId, password } = await req.json()

  const validId = process.env.TEACHER_LOGIN_ID
  const validPassword = process.env.TEACHER_LOGIN_PASSWORD

  if (!loginId || !password) {
    return NextResponse.json({ error: 'Missing credentials.' }, { status: 400 })
  }

  if (loginId !== validId || password !== validPassword) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 })
  }

  const cookieValue = createTeacherCookieValue()
  const res = NextResponse.json({ ok: true })

  res.cookies.set('teacher_session', cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })

  return res
}