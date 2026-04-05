'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function StudentLoginPage() {
  const router = useRouter()
  const [loginId, setLoginId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/student-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, pin }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Login failed')
      setLoading(false)
      return
    }

    router.push('/kanji-quiz-test')
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-lg">
        <h1 className="text-2xl font-bold text-slate-800">Student Login</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter your ID and PIN to start the quiz.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Login ID
            </label>
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="ami001"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              PIN
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="1234"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-teal-600 px-4 py-3 font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Start Quiz'}
          </button>
        </form>
      </div>
    </main>
  )
}