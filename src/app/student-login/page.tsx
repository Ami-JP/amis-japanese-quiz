'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8 md:h-10 md:w-10">
      <path
        d="M12 12c2.9 0 5-2.3 5-5.1S14.9 1.8 12 1.8 7 4.1 7 6.9 9.1 12 12 12Zm0 2.2c-4.3 0-7.8 2.3-9.3 5.7-.3.7.2 1.5 1 1.5h16.6c.8 0 1.3-.8 1-1.5-1.5-3.4-5-5.7-9.3-5.7Z"
        fill="white"
      />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8 md:h-10 md:w-10">
      <path
        d="M17 10V7.8C17 4.6 14.5 2 11.4 2S5.8 4.6 5.8 7.8V10H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8c0-1.1-.9-2-2-2H17Zm-8.7 0V7.8c0-1.8 1.4-3.3 3.1-3.3s3.1 1.5 3.1 3.3V10H8.3Zm3.1 7.3c-.8 0-1.5-.7-1.5-1.5 0-.6.3-1.1.9-1.4v-1c0-.6.5-1.1 1.1-1.1s1.1.5 1.1 1.1v1c.5.3.9.8.9 1.4 0 .8-.7 1.5-1.5 1.5Z"
        fill="white"
      />
    </svg>
  )
}

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

    try {
      const res = await fetch('/api/student-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loginId: loginId.trim(),
          pin: pin.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        setLoading(false)
        return
      }

      router.push('/kanji-quiz-test')
      router.refresh()
    } catch {
      setError('Unexpected error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#f5b400] px-4 py-5 md:px-6 md:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-[1150px] items-center justify-center">
        <div className="relative w-full overflow-hidden rounded-[44px] bg-[#e9e9e9] px-5 py-8 shadow-[0_18px_40px_rgba(0,0,0,0.12)] md:rounded-[999px] md:px-16 md:py-14">
          <div className="mx-auto flex max-w-[860px] flex-col items-center">
            <div className="rounded-full bg-[#4c97cc] px-5 py-3 text-center text-sm font-medium tracking-[0.02em] text-white md:px-10 md:py-5 md:text-[18px]">
              A little practice every day makes a big difference
            </div>

            <div className="mt-7 w-full text-left md:mt-9">
              <p className="text-[28px] font-black leading-none text-black md:text-[42px]">
                LET&apos;S START ♪
              </p>
              <h1 className="mt-2 text-[54px] font-black leading-[0.95] tracking-[-0.04em] text-black md:text-[110px]">
                KANJI QUIZ
              </h1>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 w-full max-w-[620px] md:mt-8">
              <div className="relative rounded-[30px] bg-[#f5b400] px-4 pb-7 pt-6 shadow-[0_14px_0_#d49a00] md:rounded-[38px] md:px-7 md:pb-9 md:pt-8">
                <div className="absolute -left-1 top-1 hidden md:block">
                  <div className="flex flex-col gap-2">
                    <span className="block h-3 w-10 rotate-[42deg] rounded-full bg-[#f5b400]" />
                    <span className="block h-3 w-12 rounded-full bg-[#f5b400]" />
                    <span className="block h-3 w-8 -rotate-[42deg] rounded-full bg-[#f5b400]" />
                  </div>
                </div>

                <div
                  className="absolute bottom-[-34px] right-[42px] h-0 w-0
                  border-l-[36px] border-r-[0px] border-t-[34px]
                  border-l-transparent border-r-transparent border-t-[#d49a00] md:bottom-[-48px] md:right-[76px]
                  md:border-l-[56px] md:border-t-[48px]"
                />
                <div
                  className="absolute bottom-[-24px] right-[54px] h-0 w-0
                  border-l-[26px] border-r-[0px] border-t-[24px]
                  border-l-transparent border-r-transparent border-t-[#f5b400] md:bottom-[-34px] md:right-[88px]
                  md:border-l-[40px] md:border-t-[34px]"
                />

                <div className="space-y-4 md:space-y-5">
                  <label className="flex items-center gap-3 md:gap-5">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-transparent md:h-16 md:w-16">
                      <UserIcon />
                    </div>
                    <input
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      autoComplete="username"
                      placeholder="Username"
                      className="h-14 w-full rounded-full border-0 bg-[#f3f3f3] px-6 text-[20px] text-[#424242] placeholder:text-[#585858] focus:outline-none md:h-20 md:px-10 md:text-[34px]"
                    />
                  </label>

                  <label className="flex items-center gap-3 md:gap-5">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-transparent md:h-16 md:w-16">
                      <LockIcon />
                    </div>
                    <input
                      type="password"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      autoComplete="current-password"
                      placeholder="********"
                      className="h-14 w-full rounded-full border-0 bg-[#f3f3f3] px-6 text-[20px] text-[#424242] placeholder:text-[#585858] focus:outline-none md:h-20 md:px-10 md:text-[34px]"
                    />
                  </label>
                </div>

                {error ? (
                  <p className="mt-4 rounded-2xl bg-white/75 px-4 py-3 text-center text-sm font-semibold text-red-700 md:text-base">
                    {error}
                  </p>
                ) : null}
              </div>

              <div className="mt-12 flex justify-center md:mt-16">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-full bg-[#e63333] px-9 py-3 text-[24px] font-black tracking-[0.06em] text-white shadow-[0_9px_0_#111] transition hover:translate-y-[1px] hover:shadow-[0_7px_0_#111] disabled:cursor-not-allowed disabled:opacity-60 md:px-14 md:py-4 md:text-[34px]"
                >
                  {loading ? 'LOGGING IN...' : 'LOG IN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  )
}