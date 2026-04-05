import Link from 'next/link'
import { notFound } from 'next/navigation'
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
  display_name: string | null
  student_login_id: string | null
  kanji: string
  answered_at: string | null
}

type AttemptRow = {
  kanji: string | null
  is_correct: boolean | null
  quiz_type: string | null
  answered_at: string | null
}

function formatDate(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ja-JP')
}

export default async function TeacherStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const db = supabaseAdmin as any

  const { data: student, error: studentError } = await db
    .from('teacher_student_progress_view')
    .select('*')
    .eq('student_id', id)
    .maybeSingle()

  if (studentError) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow">
          <p className="text-red-600">
            Failed to load student detail: {studentError.message}
          </p>
        </div>
      </main>
    )
  }

  if (!student) {
    notFound()
  }

  const { data: wrongRows, error: wrongError } = await db
    .from('teacher_wrong_kanji_view')
    .select('*')
    .eq('student_id', id)
    .order('answered_at', { ascending: false })

  const { data: attempts, error: attemptsError } = await db
    .from('kanji_attempts')
    .select('kanji, is_correct, quiz_type, answered_at')
    .eq('student_account_id', id)
    .order('answered_at', { ascending: false })
    .limit(20)

  if (wrongError) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow">
          <p className="text-red-600">
            Failed to load wrong answers: {wrongError.message}
          </p>
        </div>
      </main>
    )
  }

  if (attemptsError) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow">
          <p className="text-red-600">
            Failed to load attempt history: {attemptsError.message}
          </p>
        </div>
      </main>
    )
  }

  const studentData: StudentProgressRow = student
  const wrongList: WrongKanjiRow[] = wrongRows ?? []
  const attemptList: AttemptRow[] = attempts ?? []

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4">
          <Link
            href="/teacher/students"
            className="inline-flex rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow hover:bg-slate-100"
          >
            ← Back to students
          </Link>
        </div>

        <div className="mb-6 rounded-3xl bg-teal-600 px-6 py-5 text-white shadow-lg">
          <h1 className="text-2xl font-bold sm:text-3xl">
            {studentData.display_name || 'No name'}
          </h1>
          <p className="mt-2 text-sm sm:text-base text-teal-50">
            Login ID: {studentData.student_login_id || '-'}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-3xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-800">Current Progress</h2>

            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-medium text-slate-500">Current unit</dt>
                <dd className="mt-1 text-slate-800">{studentData.current_unit || '-'}</dd>
              </div>

              <div>
                <dt className="font-medium text-slate-500">Last completed order</dt>
                <dd className="mt-1 text-slate-800">
                  {studentData.last_order_completed ?? 0}
                </dd>
              </div>

              <div>
                <dt className="font-medium text-slate-500">Status</dt>
                <dd className="mt-1">
                  {studentData.is_active ? (
                    <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
                      Inactive
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-lg lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-800">Wrong Answers Remaining</h2>

            {wrongList.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">
                No remaining wrong answers. Great job.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {wrongList.map((item, index) => (
                  <div
                    key={`${item.kanji}-${index}`}
                    className="rounded-2xl bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800"
                  >
                    {item.kanji}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-3xl bg-white p-6 shadow-lg">
          <h2 className="text-lg font-semibold text-slate-800">Recent Attempts</h2>

          {attemptList.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">No attempts yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Kanji</th>
                    <th className="px-4 py-3 font-semibold">Result</th>
                    <th className="px-4 py-3 font-semibold">Quiz Type</th>
                    <th className="px-4 py-3 font-semibold">Answered At</th>
                  </tr>
                </thead>
                <tbody>
                  {attemptList.map((attempt, index) => (
                    <tr key={index} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-800">{attempt.kanji || '-'}</td>
                      <td className="px-4 py-3">
                        {attempt.is_correct ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                            Correct
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
                            Wrong
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{attempt.quiz_type || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatDate(attempt.answered_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}