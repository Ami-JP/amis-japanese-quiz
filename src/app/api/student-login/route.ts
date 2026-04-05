import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  try {
    const { loginId: rawLoginId, pin: rawPin } = await req.json()
    const loginId = String(rawLoginId ?? '').trim()
    const pin = String(rawPin ?? '').trim()
    const db = supabaseAdmin as any

    if (!loginId || !pin) {
      return NextResponse.json(
        { error: 'Login ID and PIN are required.' },
        { status: 400 }
      )
    }

    const { data: studentId, error: verifyError } = await db.rpc(
      'verify_student_login',
      {
        p_login_id: loginId,
        p_pin: pin,
      }
    )

    if (verifyError) {
      return NextResponse.json(
        { error: 'Failed to verify login.' },
        { status: 500 }
      )
    }

    if (!studentId) {
      return NextResponse.json(
        { error: 'Invalid ID or PIN.' },
        { status: 401 }
      )
    }

    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const { error: sessionError } = await db.from('student_sessions').insert({
      student_account_id: studentId,
      session_token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    })

    if (sessionError) {
      return NextResponse.json(
        { error: 'Failed to create session.' },
        { status: 500 }
      )
    }

    const res = NextResponse.json({ ok: true })

    res.cookies.set('student_session', rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    })

    return res
  } catch {
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 })
  }
}