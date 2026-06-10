type JudgeReadingAnswerParams = {
  userAnswer: string;
  answerText: unknown;
  answerAliases?: unknown;
};

const ANSWER_SEPARATOR = /[／\/、,\n\r;；|｜]+/g;

function toText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function katakanaToHiragana(value: string): string {
  return value.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

function normalizeKanaAnswer(value: unknown): string {
  return katakanaToHiragana(
    toText(value)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[。、，,.!！?？]/g, "")
  );
}

function splitAnswerText(value: unknown): string[] {
  const text = toText(value);
  if (!text || text === "null") return [];

  return text
    .split(ANSWER_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractTextFromObject(value: Record<string, unknown>): string {
  return (
    toText(value.answer_text) ||
    toText(value.answer) ||
    toText(value.reading) ||
    toText(value.ruby) ||
    toText(value.furigana) ||
    toText(value.text) ||
    toText(value.word) ||
    toText(value.kanji)
  );
}

function parseAnswerAliases(value: unknown): string[] {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => parseAnswerAliases(item));
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value).trim()].filter(Boolean);
  }

  if (typeof value === "object") {
    const text = extractTextFromObject(value as Record<string, unknown>);
    return text ? splitAnswerText(text) : [];
  }

  if (typeof value !== "string") return [];

  const text = value.trim();
  if (!text || text === "null") return [];

  try {
    const parsed = JSON.parse(text);
    if (parsed !== text) {
      return parseAnswerAliases(parsed);
    }
  } catch {}

  return splitAnswerText(text);
}

function getAcceptedKanaAnswers(params: {
  answerText: unknown;
  answerAliases?: unknown;
}): string[] {
  const rawCandidates = [
    ...splitAnswerText(params.answerText),
    ...parseAnswerAliases(params.answerAliases),
  ];

  const unique = new Map<string, string>();

  for (const candidate of rawCandidates) {
    const normalized = normalizeKanaAnswer(candidate);
    if (!normalized) continue;
    if (!unique.has(normalized)) {
      unique.set(normalized, normalized);
    }
  }

  return Array.from(unique.values());
}

function hasKana(value: string): boolean {
  return /[\u3040-\u30ff]/.test(value);
}

function hasLatin(value: string): boolean {
  return /[A-Za-zāīūēōĀĪŪĒŌ]/.test(value);
}

function isLikelyRomaji(value: string): boolean {
  const normalized = value.normalize("NFKC").trim();

  if (!normalized) return false;
  if (hasKana(normalized)) return false;

  return hasLatin(normalized);
}

function normalizeRomajiWithMacronMode(
  value: string,
  macronMode: "double-vowel" | "common"
): string {
  let text = value.normalize("NFKC").toLowerCase();

  if (macronMode === "double-vowel") {
    text = text
      .replace(/ā/g, "aa")
      .replace(/ī/g, "ii")
      .replace(/ū/g, "uu")
      .replace(/ē/g, "ee")
      .replace(/ō/g, "oo");
  } else {
    text = text
      .replace(/ā/g, "aa")
      .replace(/ī/g, "ii")
      .replace(/ū/g, "uu")
      .replace(/ē/g, "ei")
      .replace(/ō/g, "ou");
  }

  return text.replace(/[^a-z]/g, "");
}

function normalizeRomajiInputVariants(value: string): string[] {
  const variants = new Set<string>();

  variants.add(normalizeRomajiWithMacronMode(value, "double-vowel"));
  variants.add(normalizeRomajiWithMacronMode(value, "common"));

  return Array.from(variants).filter(Boolean);
}

const basicRomajiMap: Record<string, string[]> = {
  あ: ["a"],
  い: ["i"],
  う: ["u"],
  え: ["e"],
  お: ["o"],

  か: ["ka"],
  き: ["ki"],
  く: ["ku"],
  け: ["ke"],
  こ: ["ko"],

  さ: ["sa"],
  し: ["shi", "si"],
  す: ["su"],
  せ: ["se"],
  そ: ["so"],

  た: ["ta"],
  ち: ["chi", "ti"],
  つ: ["tsu", "tu"],
  て: ["te"],
  と: ["to"],

  な: ["na"],
  に: ["ni"],
  ぬ: ["nu"],
  ね: ["ne"],
  の: ["no"],

  は: ["ha"],
  ひ: ["hi"],
  ふ: ["fu", "hu"],
  へ: ["he"],
  ほ: ["ho"],

  ま: ["ma"],
  み: ["mi"],
  む: ["mu"],
  め: ["me"],
  も: ["mo"],

  や: ["ya"],
  ゆ: ["yu"],
  よ: ["yo"],

  ら: ["ra"],
  り: ["ri"],
  る: ["ru"],
  れ: ["re"],
  ろ: ["ro"],

  わ: ["wa"],
  を: ["o", "wo"],
  ん: ["n"],

  が: ["ga"],
  ぎ: ["gi"],
  ぐ: ["gu"],
  げ: ["ge"],
  ご: ["go"],

  ざ: ["za"],
  じ: ["ji", "zi"],
  ず: ["zu"],
  ぜ: ["ze"],
  ぞ: ["zo"],

  だ: ["da"],
  ぢ: ["di"],
  づ: ["du"],
  で: ["de"],
  ど: ["do"],

  ば: ["ba"],
  び: ["bi"],
  ぶ: ["bu"],
  べ: ["be"],
  ぼ: ["bo"],

  ぱ: ["pa"],
  ぴ: ["pi"],
  ぷ: ["pu"],
  ぺ: ["pe"],
  ぽ: ["po"],

  ぁ: ["a"],
  ぃ: ["i"],
  ぅ: ["u"],
  ぇ: ["e"],
  ぉ: ["o"],
};

const digraphRomajiMap: Record<string, string[]> = {
  きゃ: ["kya"],
  きゅ: ["kyu"],
  きょ: ["kyo"],

  しゃ: ["sha", "sya"],
  しゅ: ["shu", "syu"],
  しょ: ["sho", "syo"],

  ちゃ: ["cha", "tya", "cya"],
  ちゅ: ["chu", "tyu", "cyu"],
  ちょ: ["cho", "tyo", "cyo"],

  にゃ: ["nya"],
  にゅ: ["nyu"],
  にょ: ["nyo"],

  ひゃ: ["hya"],
  ひゅ: ["hyu"],
  ひょ: ["hyo"],

  みゃ: ["mya"],
  みゅ: ["myu"],
  みょ: ["myo"],

  りゃ: ["rya"],
  りゅ: ["ryu"],
  りょ: ["ryo"],

  ぎゃ: ["gya"],
  ぎゅ: ["gyu"],
  ぎょ: ["gyo"],

  じゃ: ["ja", "jya", "zya"],
  じゅ: ["ju", "jyu", "zyu"],
  じょ: ["jo", "jyo", "zyo"],

  ぢゃ: ["dya"],
  ぢゅ: ["dyu"],
  ぢょ: ["dyo"],

  びゃ: ["bya"],
  びゅ: ["byu"],
  びょ: ["byo"],

  ぴゃ: ["pya"],
  ぴゅ: ["pyu"],
  ぴょ: ["pyo"],
};

function getSyllableOptions(value: string, index: number) {
  if (index >= value.length) {
    return {
      options: [""],
      nextIndex: index + 1,
    };
  }

  const twoChars = value.slice(index, index + 2);

  if (digraphRomajiMap[twoChars]) {
    return {
      options: digraphRomajiMap[twoChars],
      nextIndex: index + 2,
    };
  }

  const oneChar = value[index];

  return {
    options: basicRomajiMap[oneChar] ?? [oneChar],
    nextIndex: index + 1,
  };
}

function getFirstConsonant(value: string): string {
  const first = value[0];

  if (!first) return "";
  if ("aeiou".includes(first)) return "";
  if (first === "n") return "n";

  return first;
}

function combineOptionSets(optionSets: string[][]): string[] {
  let results = [""];

  for (const options of optionSets) {
    const nextResults: string[] = [];

    for (const current of results) {
      for (const option of options) {
        nextResults.push(current + option);
      }
    }

    results = Array.from(new Set(nextResults));

    if (results.length > 512) {
      results = results.slice(0, 512);
    }
  }

  return results;
}

function hiraganaToStrictRomajiCandidates(value: string): string[] {
  const hira = normalizeKanaAnswer(value);

  if (!hira || !hasKana(hira)) {
    return [];
  }

  const optionSets: string[][] = [];
  let index = 0;

  while (index < hira.length) {
    const char = hira[index];

    if (char === "っ") {
      const next = getSyllableOptions(hira, index + 1);

      const doubledOptions = next.options
        .map((option) => {
          const firstConsonant = getFirstConsonant(option);
          return firstConsonant ? firstConsonant + option : option;
        })
        .filter(Boolean);

      optionSets.push(doubledOptions.length > 0 ? doubledOptions : [""]);
      index = next.nextIndex;
      continue;
    }

    if (char === "ん") {
      const next = getSyllableOptions(hira, index + 1);
      const nextStartsWithBmp = next.options.some((option) =>
        /^[bmp]/.test(option)
      );

      optionSets.push(nextStartsWithBmp ? ["n", "m"] : ["n"]);
      index += 1;
      continue;
    }

    const syllable = getSyllableOptions(hira, index);
    optionSets.push(syllable.options);
    index = syllable.nextIndex;
  }

  return combineOptionSets(optionSets)
    .map((candidate) => normalizeRomajiWithMacronMode(candidate, "common"))
    .filter(Boolean);
}

export function judgeReadingAnswer(params: JudgeReadingAnswerParams): boolean {
  const acceptedKanaAnswers = getAcceptedKanaAnswers({
    answerText: params.answerText,
    answerAliases: params.answerAliases,
  });

  if (acceptedKanaAnswers.length === 0) {
    return false;
  }

  const normalizedKanaUserAnswer = normalizeKanaAnswer(params.userAnswer);

  if (!normalizedKanaUserAnswer) {
    return false;
  }

  if (acceptedKanaAnswers.includes(normalizedKanaUserAnswer)) {
    return true;
  }

  if (!isLikelyRomaji(params.userAnswer)) {
    return false;
  }

  const normalizedRomajiUserAnswers = normalizeRomajiInputVariants(
    params.userAnswer
  );

  if (normalizedRomajiUserAnswers.length === 0) {
    return false;
  }

  const romajiCandidates = new Set(
    acceptedKanaAnswers.flatMap((answer) => hiraganaToStrictRomajiCandidates(answer))
  );

  return normalizedRomajiUserAnswers.some((userAnswer) =>
    romajiCandidates.has(userAnswer)
  );
}