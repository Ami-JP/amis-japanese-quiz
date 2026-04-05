import { redirect } from 'next/navigation'
import { verifyTeacherSession } from '@/lib/auth/teacher'

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ok = await verifyTeacherSession()

  if (!ok) {
    redirect('/teacher-login')
  }

  return <>{children}</>
}