"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

function getParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function getCourseTitle(courseSlug: string) {
  if (courseSlug === "n4-28days") {
    return "N4 30日集中対策";
  }

  return "Course Quiz";
}

export default function CourseLoginPage() {
  const params = useParams();
  const router = useRouter();

  const courseSlug = getParamValue(params.courseSlug);

  const [studentLoginId, setStudentLoginId] = useState("");
  const [pin, setPin] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) return;

    setErrorMessage("");

    const trimmedLoginId = studentLoginId.trim();
    const trimmedPin = pin.trim();

    if (!trimmedLoginId || !trimmedPin) {
      setErrorMessage("Login ID と PIN を入力してください。");
      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch("/api/student-login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          student_login_id: trimmedLoginId,
          studentLoginId: trimmedLoginId,
          loginId: trimmedLoginId,
          pin: trimmedPin,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "ログインできませんでした。");
      }

      router.push(`/course/${encodeURIComponent(courseSlug)}`);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "ログインできませんでした。";
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <section className="loginCard">
        <div className="badge">JLPT COURSE</div>

        <p className="emoji">🌸</p>

        <h1 className="title">{getCourseTitle(courseSlug)}</h1>

        <p className="subtitle">
          Login ID と PIN を入力してください。
        </p>

        <form className="form" onSubmit={handleLogin}>
          <label className="label" htmlFor="student-login-id">
            Login ID
          </label>
          <input
            id="student-login-id"
            className="input"
            value={studentLoginId}
            onChange={(event) => setStudentLoginId(event.target.value)}
            placeholder="例：student001"
            autoComplete="username"
          />

          <label className="label" htmlFor="student-pin">
            PIN
          </label>
          <input
            id="student-pin"
            className="input"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            placeholder="PIN"
            type="password"
            autoComplete="current-password"
          />

          {errorMessage && <p className="errorText">{errorMessage}</p>}

          <button className="loginButton" type="submit" disabled={submitting}>
            {submitting ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="note">
          This login is for this course only.
        </p>
      </section>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .page {
    min-height: 100vh;
    padding: 20px;
    background:
      radial-gradient(circle at top left, rgba(255, 211, 105, 0.22), transparent 32%),
      radial-gradient(circle at bottom right, rgba(128, 169, 255, 0.18), transparent 28%),
      linear-gradient(180deg, #12162a 0%, #101424 48%, #0b1020 100%);
    color: #f8fafc;
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .loginCard {
    width: min(430px, 100%);
    padding: 28px;
    border-radius: 30px;
    background: rgba(255, 255, 255, 0.94);
    color: #111827;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
    text-align: center;
  }

  .badge {
    display: inline-flex;
    padding: 7px 11px;
    border-radius: 999px;
    background: #fef3c7;
    color: #92400e;
    font-size: 12px;
    font-weight: 950;
    letter-spacing: 0.05em;
  }

  .emoji {
    margin: 18px 0 8px;
    font-size: 48px;
  }

  .title {
    margin: 0;
    font-size: 30px;
    font-weight: 950;
    letter-spacing: -0.04em;
  }

  .subtitle {
    margin: 10px 0 22px;
    color: #64748b;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.6;
  }

  .form {
    text-align: left;
  }

  .label {
    display: block;
    margin: 14px 2px 7px;
    color: #334155;
    font-size: 13px;
    font-weight: 900;
  }

  .input {
    width: 100%;
    box-sizing: border-box;
    padding: 15px 16px;
    border-radius: 18px;
    border: 2px solid #cbd5e1;
    background: #ffffff;
    color: #111827;
    font-size: 18px;
    font-weight: 800;
    outline: none;
  }

  .input:focus {
    border-color: #f59e0b;
    box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.16);
  }

  .errorText {
    margin: 14px 0 0;
    padding: 10px 12px;
    border-radius: 14px;
    background: #fee2e2;
    color: #b91c1c;
    font-size: 13px;
    font-weight: 800;
    line-height: 1.5;
  }

  .loginButton {
    width: 100%;
    margin-top: 20px;
    padding: 15px 18px;
    border-radius: 999px;
    border: none;
    background: linear-gradient(90deg, #facc15, #fb923c);
    color: #111827;
    font-size: 16px;
    font-weight: 950;
    box-shadow: 0 10px 0 #c2410c;
    cursor: pointer;
  }

  .loginButton:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    box-shadow: none;
  }

  .note {
    margin: 18px 0 0;
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
  }

  @media (max-width: 520px) {
    .page {
      padding: 14px;
    }

    .loginCard {
      padding: 24px 18px;
      border-radius: 26px;
    }

    .title {
      font-size: 26px;
    }
  }
`;