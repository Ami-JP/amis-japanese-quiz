"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type QQ = {
  id: number;
  unit: string;
  category: string;
  question_type: string;
  prompt: string;
  translation_en: string | null;
  hint_ja: string | null;
  hint_en: string | null;
  explanation_ja: string | null;
  explanation_en: string | null;
  answer_text: string | null;
  answer_aliases: string[] | null;
  target_text: string | null;
  meaning_ja: string | null;
  meaning_en: string | null;
  onyomi_ja: string | null;
  kunyomi_ja: string | null;
  onyomi_en: string | null;
  kunyomi_en: string | null;
};

const BATCH_SIZE = 7;

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function wrongKey(unit: string) {
  return `wrong_ids:${unit}`;
}
function loadWrongIds(unit: string): number[] {
  try {
    const raw = localStorage.getItem(wrongKey(unit));
    if (!raw) return [];
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((x) => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}
function saveWrongIds(unit: string, ids: number[]) {
  localStorage.setItem(wrongKey(unit), JSON.stringify(Array.from(new Set(ids))));
}
function clearWrongIds(unit: string) {
  localStorage.removeItem(wrongKey(unit));
}
function removeWrongId(unit: string, id: number) {
  const now = loadWrongIds(unit);
  saveWrongIds(unit, now.filter((x) => x !== id));
}

type DeckState = {
  order: number[];
  cursor: number;
  poolHash: string;
};

function deckKey(unit: string, mode: "normal" | "reviewWrong") {
  return `deck:${unit}:${mode}`;
}
function loadDeck(unit: string, mode: "normal" | "reviewWrong"): DeckState | null {
  try {
    const raw = localStorage.getItem(deckKey(unit, mode));
    if (!raw) return null;
    const d = JSON.parse(raw) as DeckState;
    if (!d || !Array.isArray(d.order) || typeof d.cursor !== "number") return null;
    return d;
  } catch {
    return null;
  }
}
function saveDeck(unit: string, mode: "normal" | "reviewWrong", d: DeckState) {
  localStorage.setItem(deckKey(unit, mode), JSON.stringify(d));
}
function clearDeck(unit: string, mode?: "normal" | "reviewWrong") {
  if (mode) localStorage.removeItem(deckKey(unit, mode));
  else {
    localStorage.removeItem(deckKey(unit, "normal"));
    localStorage.removeItem(deckKey(unit, "reviewWrong"));
  }
}
function hashIds(ids: number[]) {
  const s = [...ids].sort((a, b) => a - b);
  const head = s.slice(0, 5).join(",");
  const tail = s.slice(-5).join(",");
  return `${s.length}|${head}|${tail}`;
}
function drawBatchFromDeck(unit: string, mode: "normal" | "reviewWrong", poolIds: number[]): number[] {
  if (poolIds.length === 0) return [];

  const poolHash = hashIds(poolIds);
  let deck = loadDeck(unit, mode);

  if (!deck || deck.poolHash !== poolHash) {
    deck = { order: shuffle(poolIds), cursor: 0, poolHash };
  }

  const remaining = deck.order.length - deck.cursor;
  if (remaining < BATCH_SIZE) {
    deck = { order: shuffle(poolIds), cursor: 0, poolHash };
  }

  const batch = deck.order.slice(deck.cursor, deck.cursor + BATCH_SIZE);
  deck.cursor += BATCH_SIZE;

  saveDeck(unit, mode, deck);
  return batch;
}

function normalizeAnswer(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

function renderPromptWithUnderline(prompt: string, targetText: string | null) {
  if (!targetText || !prompt.includes(targetText)) return prompt;

  const parts = prompt.split(targetText);
  return (
    <>
      {parts[0]}
      <u>{targetText}</u>
      {parts.slice(1).join(targetText)}
    </>
  );
}

export default function Page() {
  const UNIT = "n1-kanji-01";

  const [allQuestions, setAllQuestions] = useState<QQ[]>([]);
  const [mode, setMode] = useState<"normal" | "reviewWrong">("normal");

  const [batchIds, setBatchIds] = useState<number[]>([]);
  const [idx, setIdx] = useState(0);

  const [inputValue, setInputValue] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [wrongVersion, setWrongVersion] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mapById = useMemo(() => new Map(allQuestions.map((q) => [q.id, q])), [allQuestions]);

  const normalPoolIds = useMemo(() => allQuestions.map((q) => q.id), [allQuestions]);
  const reviewPoolIds = useMemo(() => {
    const wrong = new Set(loadWrongIds(UNIT));
    return allQuestions.filter((q) => wrong.has(q.id)).map((q) => q.id);
  }, [allQuestions, wrongVersion]);

  const batchQuestions = useMemo(() => {
    return batchIds.map((id) => mapById.get(id)).filter(Boolean) as QQ[];
  }, [batchIds, mapById]);

  const current = useMemo(() => batchQuestions[idx], [batchQuestions, idx]);
  const finished = batchQuestions.length > 0 && idx >= batchQuestions.length;

  const pageStyle: React.CSSProperties = {
    background: "#ffffff",
    color: "#111111",
    minHeight: "100vh",
    padding: 24,
  };
  const cardStyle: React.CSSProperties = { maxWidth: 820, margin: "0 auto" };

  const primaryBtn: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 12,
    border: "2px solid #111",
    background: "#111",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  };
  const ghostBtn: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #ccc",
    background: "#fff",
    color: "#111",
    fontWeight: 800,
    cursor: "pointer",
  };

  function resetRunState() {
    setIdx(0);
    setInputValue("");
    setShowResult(false);
    setShowTranslation(false);
    setShowHint(false);
    setIsCorrect(null);
    setCorrectCount(0);
    setMenuOpen(false);
  }

  function newBatch(nextMode: "normal" | "reviewWrong") {
    setMode(nextMode);
    const poolIds = nextMode === "normal" ? normalPoolIds : reviewPoolIds;
    const picked = drawBatchFromDeck(UNIT, nextMode, poolIds);
    setBatchIds(picked);
    resetRunState();
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("questions_master")
        .select(`
          id,
          unit,
          category,
          question_type,
          prompt,
          translation_en,
          hint_ja,
          hint_en,
          explanation_ja,
          explanation_en,
          answer_text,
          answer_aliases,
          target_text,
          meaning_ja,
          meaning_en,
          onyomi_ja,
          kunyomi_ja,
          onyomi_en,
          kunyomi_en
        `)
        .eq("unit", UNIT)
        .eq("category", "kanji")
        .eq("question_type", "input")
        .order("id", { ascending: true });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const fetched = (data ?? []) as QQ[];
      setAllQuestions(fetched);

      const poolIds = fetched.map((q) => q.id);
      const picked = drawBatchFromDeck(UNIT, "normal", poolIds);
      setBatchIds(picked);

      setLoading(false);
    })();
  }, []);

  function submit() {
    if (!current) return;

    const accepted = [
      current.answer_text ?? "",
      ...((current.answer_aliases ?? []) as string[]),
    ].map(normalizeAnswer);

    const ok = accepted.includes(normalizeAnswer(inputValue));

    setShowResult(true);
    setIsCorrect(ok);

    if (ok) {
      setCorrectCount((c) => c + 1);
      if (mode === "reviewWrong") {
        removeWrongId(UNIT, current.id);
        setWrongVersion((v) => v + 1);
      }
    } else {
      saveWrongIds(UNIT, [...loadWrongIds(UNIT), current.id]);
      setWrongVersion((v) => v + 1);
    }
  }

  function next() {
    setInputValue("");
    setShowResult(false);
    setShowTranslation(false);
    setShowHint(false);
    setIsCorrect(null);
    setIdx((i) => i + 1);
  }

  if (loading) return <main style={pageStyle}>Loading...</main>;
  if (error) return <main style={pageStyle}>Error: {error}</main>;

  if (allQuestions.length === 0) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1>Kanji Reading Quiz / 漢字読みクイズ</h1>
          <p>No questions found. / 問題がありません。</p>
        </div>
      </main>
    );
  }

  if (mode === "reviewWrong" && reviewPoolIds.length === 0) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1>Review / 復習</h1>
          <p>All cleared! / 全部できました🎉</p>
          <button style={ghostBtn} onClick={() => newBatch("normal")}>
            Back to normal / 通常に戻る
          </button>
        </div>
      </main>
    );
  }

  if (finished) {
    const wrongCount = loadWrongIds(UNIT).length;

    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1>Result / 結果</h1>
          <p>
            <b>{batchQuestions.length}</b> questions / <b>{batchQuestions.length}</b>問中{" "}
            <b>{correctCount}</b> correct / <b>{correctCount}</b>問正解
          </p>

          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            <button style={primaryBtn} onClick={() => newBatch(mode)}>
              Next 7 / 次の7問
            </button>

            {mode === "reviewWrong" && (
              <button style={ghostBtn} onClick={() => newBatch("normal")}>
                Back to normal / 通常に戻る
              </button>
            )}

            {mode === "normal" && (
              <button style={ghostBtn} onClick={() => newBatch("reviewWrong")}>
                Review mistakes ({wrongCount}) / 間違い復習（{wrongCount}）
              </button>
            )}

            <button
              style={ghostBtn}
              onClick={() => {
                clearWrongIds(UNIT);
                clearDeck(UNIT);
                setWrongVersion((v) => v + 1);
                newBatch("normal");
              }}
            >
              Reset history / 履歴リセット
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={{ marginBottom: 6 }}>Kanji Reading Quiz / 漢字読みクイズ</h1>

        <div style={{ opacity: 0.8 }}>
          {idx + 1} / {batchQuestions.length} <span style={{ marginLeft: 8 }}>(Set of 7 / 7問セット)</span>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button style={ghostBtn} onClick={() => setMenuOpen((v) => !v)}>
            Menu / メニュー
          </button>
        </div>

        {menuOpen && (
          <div style={{ marginTop: 10, padding: 12, border: "1px solid #ccc", borderRadius: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Menu / メニュー</div>
            <div style={{ display: "grid", gap: 10 }}>
              <button style={primaryBtn} onClick={() => newBatch(mode)}>
                New set (7) / 新しい7問
              </button>

              <button style={ghostBtn} onClick={() => newBatch("normal")}>
                Normal mode / 通常モード
              </button>

              <button style={ghostBtn} onClick={() => newBatch("reviewWrong")}>
                Review mistakes / 間違い復習
              </button>

              <button
                style={ghostBtn}
                onClick={() => {
                  clearWrongIds(UNIT);
                  clearDeck(UNIT);
                  setWrongVersion((v) => v + 1);
                  newBatch("normal");
                }}
              >
                Reset history / 履歴リセット
              </button>

              <button style={ghostBtn} onClick={() => setMenuOpen(false)}>
                Close / 閉じる
              </button>
            </div>
          </div>
        )}

        <h2 style={{ marginTop: 18, fontSize: 28, lineHeight: 1.6 }}>
          {renderPromptWithUnderline(current.prompt, current.target_text)}
        </h2>

        {current.translation_en && (
          <div style={{ marginTop: 10 }}>
            {!showTranslation ? (
              <button style={ghostBtn} onClick={() => setShowTranslation(true)}>
                Show translation / 英訳を見る
              </button>
            ) : (
              <div style={{ marginTop: 8, padding: 10, border: "1px dashed #aaa", borderRadius: 12 }}>
                🌍 {current.translation_en}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type in hiragana or romaji / ひらがな または ローマ字で入力"
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 12,
              border: "1px solid #ccc",
              fontSize: 18,
            }}
            disabled={showResult}
          />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button style={ghostBtn} onClick={() => setShowHint((v) => !v)}>
            Hint / ヒント
          </button>
        </div>

        {showHint && (
          <div style={{ marginTop: 10, padding: 10, border: "1px dashed #aaa", borderRadius: 12 }}>
            {current.hint_ja && <div>📝 {current.hint_ja}</div>}
            {current.hint_en && <div style={{ marginTop: 6 }}>🌍 {current.hint_en}</div>}
          </div>
        )}

        {!showResult ? (
          <button
            style={{
              ...ghostBtn,
              marginTop: 16,
              width: "100%",
              padding: "14px 18px",
              fontWeight: 900,
              opacity: inputValue.trim() ? 1 : 0.55,
            }}
            onClick={submit}
            disabled={!inputValue.trim()}
          >
            Answer / 回答する
          </button>
        ) : (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 900 }}>
              {isCorrect ? "✅ Correct! / 正解！" : "❌ Not quite. / ちがうよ"}
            </div>

            {(current.meaning_ja || current.meaning_en) && (
              <div style={{ marginTop: 10, padding: 10, border: "1px dashed #aaa", borderRadius: 12 }}>
                {current.meaning_ja && <div>📝 {current.meaning_ja}</div>}
                {current.meaning_en && <div style={{ marginTop: 6 }}>🌍 {current.meaning_en}</div>}
              </div>
            )}

            <button style={{ ...primaryBtn, marginTop: 10, width: "100%", fontSize: 18 }} onClick={next}>
              Next / 次へ
            </button>
          </div>
        )}
      </div>
    </main>
  );
}