"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type QQ = {
  id: number;
  unit: string;
  category: string;
  question_type: string;
  prompt: string;
  choice_a: string | null;
  choice_b: string | null;
  choice_c: string | null;
  choice_d: string | null;
  answer_choice: "A" | "B" | "C" | "D" | null;
  translation_en: string | null;
  hint_ja: string | null;
  hint_en: string | null;
  explanation_ja: string | null;
  explanation_en: string | null;
};

const BATCH_SIZE = 7;

// ---------- utils ----------
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

// ---------- deck ----------
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
function drawBatchFromDeck(
  unit: string,
  mode: "normal" | "reviewWrong",
  poolIds: number[]
): number[] {
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

// ---------- component ----------
export default function Page() {
  const UNIT = "connectors-1";

  const [allQuestions, setAllQuestions] = useState<QQ[]>([]);
  const [mode, setMode] = useState<"normal" | "reviewWrong">("normal");

  const [batchIds, setBatchIds] = useState<number[]>([]);
  const [idx, setIdx] = useState(0);

  const [selected, setSelected] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

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

  function choiceBtn(choice: "A" | "B" | "C" | "D"): React.CSSProperties {
    const isSelected = selected === choice;
    return {
      padding: "14px 16px",
      textAlign: "left",
      borderRadius: 14,
      border: isSelected ? "4px solid #111" : "1px solid #ccc",
      background: isSelected ? "#ffeaa7" : "#fff",
      color: "#111",
      fontWeight: isSelected ? 900 : 600,
      cursor: showResult ? "default" : "pointer",
    };
  }

  function resetRunState() {
    setIdx(0);
    setSelected(null);
    setShowResult(false);
    setShowTranslation(false);
    setShowExplanation(false);
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
          choice_a,
          choice_b,
          choice_c,
          choice_d,
          answer_choice,
          translation_en,
          hint_ja,
          hint_en,
          explanation_ja,
          explanation_en
        `)
        .eq("unit", UNIT)
        .eq("category", "connectors")
        .eq("question_type", "choice4")
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
    if (!current || !selected) return;
    const ok = selected === current.answer_choice;
    setShowResult(true);

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
    setSelected(null);
    setShowResult(false);
    setShowTranslation(false);
    setShowExplanation(false);
    setIdx((i) => i + 1);
  }

  if (loading) return <main style={pageStyle}>Loading...</main>;
  if (error) return <main style={pageStyle}>Error: {error}</main>;

  if (allQuestions.length === 0) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1>Connectors Quiz / 接続詞クイズ</h1>
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
        <h1 style={{ marginBottom: 6 }}>Connectors Quiz / 接続詞クイズ</h1>

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

        <h2 style={{ marginTop: 18, fontSize: 28, lineHeight: 1.4 }}>{current.prompt}</h2>

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

        {showResult && (current.explanation_ja || current.explanation_en) && (
          <div style={{ marginTop: 10 }}>
            {!showExplanation ? (
              <button style={ghostBtn} onClick={() => setShowExplanation(true)}>
                Show explanation / 解説を見る
              </button>
            ) : (
              <div style={{ marginTop: 8, padding: 10, border: "1px dashed #aaa", borderRadius: 12 }}>
                {current.explanation_ja && <div>📝 {current.explanation_ja}</div>}
                {current.explanation_en && <div style={{ marginTop: 6 }}>🌍 {current.explanation_en}</div>}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <button style={choiceBtn("A")} onClick={() => setSelected("A")} disabled={showResult}>
            <b>A.</b> {current.choice_a}
          </button>
          <button style={choiceBtn("B")} onClick={() => setSelected("B")} disabled={showResult}>
            <b>B.</b> {current.choice_b}
          </button>
          <button style={choiceBtn("C")} onClick={() => setSelected("C")} disabled={showResult}>
            <b>C.</b> {current.choice_c}
          </button>
          <button style={choiceBtn("D")} onClick={() => setSelected("D")} disabled={showResult}>
            <b>D.</b> {current.choice_d}
          </button>
        </div>

        {!showResult ? (
          <button
            style={{
              ...ghostBtn,
              marginTop: 16,
              width: "100%",
              padding: "14px 18px",
              fontWeight: 900,
              opacity: selected ? 1 : 0.55,
            }}
            onClick={submit}
            disabled={!selected}
          >
            Answer / 回答する
          </button>
        ) : (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 900 }}>
              {selected === current.answer_choice ? "✅ Correct! / 正解！" : "❌ Not quite. / ちがうよ"}
            </div>
            <button style={{ ...primaryBtn, marginTop: 10, width: "100%", fontSize: 18 }} onClick={next}>
              Next / 次へ
            </button>
          </div>
        )}
      </div>
    </main>
  );
}