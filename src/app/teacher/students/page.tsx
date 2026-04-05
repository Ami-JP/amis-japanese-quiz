import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type StudentProgressRow = {
  student_id: string
  display_name: string | null
  student_login_id: string | null
  is_active: boolean | null
  current_unit: string | null
  last_order_completed: number | null
}

type WrongKanjiRow = {
  student_id: string
  kanji: string
}

function formatProgress(lastOrderCompleted: number | null) {
  if (lastOrderCompleted === null || lastOrderCompleted === undefined) {
    return '0'
  }
  return String(lastOrderCompleted)
}

export default async function TeacherStudentsPage() {
  const db = supabaseAdmin as any

  const { data: progressRows, error: progressError } = await db
    .from('teacher_student_progress_view')
    .select('*')
    .order('display_name', { ascending: true })

  const { data: wrongRows, error: wrongError } = await db
    .from('teacher_wrong_kanji_view')
    .select('student_id, kanji')

  if (progressError) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow">
          <h1 className="text-2xl font-bold text-slate-800">Teacher Dashboard</h1>
          <p className="mt-4 text-red-600">
            Failed to load student progress: {progressError.message}
          </p>
        </div>
      </main>
    )
  }

  if (wrongError) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow">
          <h1 className="text-2xl font-bold text-slate-800">Teacher Dashboard</h1>
          <p className="mt-4 text-red-600">
            Failed to load wrong kanji data: {wrongError.message}
          </p>
        </div>
      </main>
    )
  }

  const progressList: StudentProgressRow[] = progressRows ?? []
  const wrongList: WrongKanjiRow[] = wrongRows ?? []

  const wrongCountMap = new Map<string, number>()

  for (const row of wrongList) {
    const current = wrongCountMap.get(row.student_id) ?? 0
    wrongCountMap.set(row.student_id, current + 1)
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-3xl bg-teal-600 px-6 py-5 text-white shadow-lg">
          <h1 className="text-2xl font-bold sm:text-3xl">Teacher Dashboard</h1>
          <p className="mt-2 text-sm sm:text-base text-teal-50">
            Check each student’s current unit, progress, and wrong answers.
          </p>
        </div>

        <div className="overflow-hidden rounded-3xl bg-white shadow-lg">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-800">Students</h2>
          </div>

          {progressList.length === 0 ? (
            <div className="px-6 py-8 text-slate-600">No students found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Login ID</th>
                    <th className="px-4 py-3 font-semibold">Current Unit</th>
                    <th className="px-4 py-3 font-semibold">Progress</th>
                    <th className="px-4 py-3 font-semibold">Wrong Now</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {progressList.map((student) => {
                    const wrongNow = wrongCountMap.get(student.student_id) ?? 0

                    return (
                      <tr
                        key={student.student_id}
                        className="border-t border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 text-slate-800">
                          {student.display_name || 'No name'}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {student.student_login_id || '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {student.current_unit || '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {formatProgress(student.last_order_completed)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                            {wrongNow}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {student.is_active ? (
                            <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/teacher/students/${student.student_id}`}
                            className="inline-flex rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}