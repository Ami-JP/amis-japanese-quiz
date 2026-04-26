'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

function UserIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: size, height: size }}>
      <path
        d="M12 12c2.9 0 5-2.3 5-5.1S14.9 1.8 12 1.8 7 4.1 7 6.9 9.1 12 12 12Zm0 2.2c-4.3 0-7.8 2.3-9.3 5.7-.3.7.2 1.5 1 1.5h16.6c.8 0 1.3-.8 1-1.5-1.5-3.4-5-5.7-9.3-5.7Z"
        fill="white"
      />
    </svg>
  )
}

function LockIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: size, height: size }}>
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
  const [windowWidth, setWindowWidth] = useState(1200)
  const [windowHeight, setWindowHeight] = useState(900)

  useEffect(() => {
    function handleResize() {
      setWindowWidth(window.innerWidth)
      setWindowHeight(window.innerHeight)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const isMobile = windowWidth <= 768
  const isSmallMobile = windowWidth <= 430
  const isShortDesktop = !isMobile && windowHeight < 860

  const pagePadding = isMobile ? 8 : 12
  const iconSize = isMobile ? (isSmallMobile ? 28 : 32) : isShortDesktop ? 38 : 44

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

      router.push("/student-home");
      router.refresh()
    } catch {
      setError('Unexpected error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: '#f2b400',
        padding: `${pagePadding}px`,
        color: '#111',
        overflow: 'hidden',
        WebkitTextSizeAdjust: '100%',
        fontFamily:
          'Arial, Helvetica, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          minHeight: `calc(100dvh - ${pagePadding * 2}px)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: isMobile ? 560 : 1400,
            height: isMobile
              ? 'auto'
              : isShortDesktop
              ? 'min(calc(100dvh - 24px), 720px)'
              : 'min(calc(100dvh - 24px), 860px)',
            background: '#e8e8e8',
            borderRadius: isMobile ? 34 : 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
            padding: isMobile
              ? isSmallMobile
                ? '18px 14px 22px'
                : '22px 18px 26px'
              : isShortDesktop
              ? '20px 32px'
              : '28px 40px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: isMobile ? 520 : 980,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                background: '#4a97cc',
                color: '#fff',
                borderRadius: 999,
                padding: isMobile
                  ? isSmallMobile
                    ? '10px 14px'
                    : '12px 18px'
                  : isShortDesktop
                  ? '14px 28px'
                  : '20px 36px',
                fontSize: isMobile ? (isSmallMobile ? 14 : 16) : isShortDesktop ? 22 : 28,
                textAlign: 'center',
                lineHeight: 1.25,
                width: isMobile ? '100%' : 'auto',
                maxWidth: isMobile ? '100%' : 860,
                boxSizing: 'border-box',
              }}
            >
              A little practice every day makes a big difference
            </div>

            <div
              style={{
                width: '100%',
                marginTop: isMobile ? 18 : isShortDesktop ? 24 : 38,
              }}
            >
              <div
                style={{
                  fontSize: isMobile ? (isSmallMobile ? 22 : 26) : isShortDesktop ? 32 : 42,
                  fontWeight: 900,
                  lineHeight: 1.08,
                  color: '#111',
                }}
              >
                LET&apos;S START ♪
              </div>

              <h1
                style={{
                  margin: isMobile ? '6px 0 0' : '8px 0 0',
                  fontSize: isMobile ? (isSmallMobile ? 46 : 58) : isShortDesktop ? 76 : 108,
                  fontWeight: 900,
                  letterSpacing: '-0.05em',
                  lineHeight: 0.95,
                  color: '#111',
                  wordBreak: 'break-word',
                }}
              >
                KANJI QUIZ
              </h1>
            </div>

            <form
              onSubmit={handleSubmit}
              style={{
                width: '100%',
                maxWidth: isMobile ? '100%' : isShortDesktop ? 640 : 720,
                marginTop: isMobile ? 18 : isShortDesktop ? 20 : 34,
              }}
            >
              <div style={{ position: 'relative' }}>
                {!isMobile ? (
                  <div
                    style={{
                      position: 'absolute',
                      left: isShortDesktop ? -40 : -54,
                      top: isShortDesktop ? -10 : -14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: isShortDesktop ? 8 : 12,
                    }}
                    aria-hidden="true"
                  >
                    <span
                      style={{
                        display: 'block',
                        height: isShortDesktop ? 8 : 10,
                        width: isShortDesktop ? 34 : 42,
                        borderRadius: 999,
                        background: '#f2b400',
                        transform: 'rotate(45deg)',
                      }}
                    />
                    <span
                      style={{
                        display: 'block',
                        height: isShortDesktop ? 8 : 10,
                        width: isShortDesktop ? 40 : 48,
                        borderRadius: 999,
                        background: '#f2b400',
                      }}
                    />
                    <span
                      style={{
                        display: 'block',
                        height: isShortDesktop ? 8 : 10,
                        width: isShortDesktop ? 30 : 36,
                        borderRadius: 999,
                        background: '#f2b400',
                        transform: 'rotate(-45deg)',
                      }}
                    />
                  </div>
                ) : null}

                <div
                  style={{
                    position: 'relative',
                    background: '#f2b400',
                    borderRadius: isMobile ? 26 : 40,
                    padding: isMobile
                      ? isSmallMobile
                        ? '18px 12px 24px'
                        : '20px 16px 26px'
                      : isShortDesktop
                      ? '24px 28px 30px'
                      : '34px 38px 42px',
                    boxShadow: isMobile ? '0 10px 0 #d49f00' : '0 18px 0 #d49f00',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: isMobile ? 10 : 18,
                      marginBottom: isMobile ? 12 : 18,
                    }}
                  >
                    <div
                      style={{
                        width: isMobile ? 42 : isShortDesktop ? 58 : 70,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <UserIcon size={iconSize} />
                    </div>

                    <input
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      autoComplete="username"
                      placeholder="Username"
                      style={{
                        width: '100%',
                        height: isMobile ? (isSmallMobile ? 52 : 58) : isShortDesktop ? 70 : 86,
                        borderRadius: 999,
                        border: 'none',
                        outline: 'none',
                        background: '#f3f3f3',
                        color: '#444',
                        padding: isMobile
                          ? isSmallMobile
                            ? '0 18px'
                            : '0 20px'
                          : isShortDesktop
                          ? '0 26px'
                          : '0 34px',
                        fontSize: isMobile ? (isSmallMobile ? 18 : 22) : isShortDesktop ? 28 : 34,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: isMobile ? 10 : 18,
                    }}
                  >
                    <div
                      style={{
                        width: isMobile ? 42 : isShortDesktop ? 58 : 70,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <LockIcon size={iconSize} />
                    </div>

                    <input
                      type="password"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      autoComplete="current-password"
                      placeholder="********"
                      style={{
                        width: '100%',
                        height: isMobile ? (isSmallMobile ? 52 : 58) : isShortDesktop ? 70 : 86,
                        borderRadius: 999,
                        border: 'none',
                        outline: 'none',
                        background: '#f3f3f3',
                        color: '#444',
                        padding: isMobile
                          ? isSmallMobile
                            ? '0 18px'
                            : '0 20px'
                          : isShortDesktop
                          ? '0 26px'
                          : '0 34px',
                        fontSize: isMobile ? (isSmallMobile ? 18 : 22) : isShortDesktop ? 28 : 34,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {error ? (
                    <p
                      style={{
                        margin: '14px 0 0',
                        padding: isMobile ? '10px 12px' : '12px 16px',
                        borderRadius: 18,
                        background: 'rgba(255,255,255,0.82)',
                        color: '#b42318',
                        fontSize: isMobile ? 14 : 18,
                        fontWeight: 700,
                        textAlign: 'center',
                      }}
                    >
                      {error}
                    </p>
                  ) : null}

                  <div
                    style={{
                      position: 'absolute',
                      right: isMobile ? 34 : isShortDesktop ? 70 : 84,
                      bottom: isMobile ? -30 : isShortDesktop ? -48 : -58,
                      width: 0,
                      height: 0,
                      borderLeft: isMobile
                        ? '42px solid transparent'
                        : isShortDesktop
                        ? '68px solid transparent'
                        : '86px solid transparent',
                      borderTop: isMobile
                        ? '32px solid #d49f00'
                        : isShortDesktop
                        ? '52px solid #d49f00'
                        : '64px solid #d49f00',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      right: isMobile ? 42 : isShortDesktop ? 80 : 98,
                      bottom: isMobile ? -20 : isShortDesktop ? -34 : -40,
                      width: 0,
                      height: 0,
                      borderLeft: isMobile
                        ? '30px solid transparent'
                        : isShortDesktop
                        ? '48px solid transparent'
                        : '62px solid transparent',
                      borderTop: isMobile
                        ? '22px solid #f2b400'
                        : isShortDesktop
                        ? '36px solid #f2b400'
                        : '44px solid #f2b400',
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginTop: isMobile ? 34 : isShortDesktop ? 46 : 64,
                }}
              >
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    border: 'none',
                    borderRadius: 999,
                    background: '#e53935',
                    color: '#fff',
                    fontWeight: 900,
                    fontSize: isMobile ? (isSmallMobile ? 22 : 26) : isShortDesktop ? 28 : 34,
                    letterSpacing: '0.06em',
                    padding: isMobile
                      ? isSmallMobile
                        ? '14px 28px'
                        : '16px 34px'
                      : isShortDesktop
                      ? '16px 42px'
                      : '20px 54px',
                    cursor: 'pointer',
                    boxShadow: isMobile ? '0 7px 0 #111' : '0 10px 0 #111',
                    opacity: loading ? 0.7 : 1,
                  }}
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