import crypto from 'crypto'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function getStudentSession() {
  const cookieStore = await cookies()
  const rawToken = cookieStore.get('student_session')?.value

  if (!rawToken) return null

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const db = supabaseAdmin as any

  const { data, error } = await db
    .from('student_sessions')
    .select('student_account_id, expires_at')
    .eq('session_token_hash', tokenHash)
    .maybeSingle()

  if (error || !data) return null

  if (new Date(data.expires_at).getTime() < Date.now()) {
    return null
  }

  return {
    studentAccountId: data.student_account_id as string,
  }
}