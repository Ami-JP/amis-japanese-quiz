export type QuizKind = "meaning" | "reading";

export type KanjiUnit = {
  level: number;
  unitNumber: number;
  levelLabel: string;
  unitLabel: string;
  unit: string;
};

export type KanjiLevel = {
  level: number;
  levelLabel: string;
  unitCount: number;
  units: KanjiUnit[];
};

const LEVEL_CONFIG = [
  {
    level: 1,
    unitCount: 4,
  },
  {
    level: 2,
    unitCount: 9,
  },
  {
    level: 3,
    unitCount: 11,
  },
  {
    level: 4,
    unitCount: 10,
  },
  {
    level: 5,
    unitCount: 10,
  },
  {
    level: 6,
    unitCount: 9,
  },
];

function buildUnits(level: number, unitCount: number): KanjiUnit[] {
  return Array.from({ length: unitCount }, (_, index) => {
    const unitNumber = index + 1;
    const unitLabelNumber = String(unitNumber).padStart(2, "0");

    return {
      level,
      unitNumber,
      levelLabel: `Level ${level}`,
      unitLabel: `Unit ${unitLabelNumber}`,
      unit: `grade${level}-kanji-${unitLabelNumber}`,
    };
  });
}

export const KANJI_LEVELS: KanjiLevel[] = LEVEL_CONFIG.map((item) => ({
  level: item.level,
  levelLabel: `Level ${item.level}`,
  unitCount: item.unitCount,
  units: buildUnits(item.level, item.unitCount),
}));

export const ALL_KANJI_UNITS: KanjiUnit[] = KANJI_LEVELS.flatMap(
  (level) => level.units
);

export const ALL_KANJI_UNIT_IDS = ALL_KANJI_UNITS.map((item) => item.unit);

export function getKanjiLevel(level: number): KanjiLevel | null {
  return KANJI_LEVELS.find((item) => item.level === level) ?? null;
}

export function normalizeQuizKind(value: unknown): QuizKind {
  if (Array.isArray(value)) {
    return normalizeQuizKind(value[0]);
  }

  if (typeof value !== "string") {
    return "meaning";
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "reading") {
    return "reading";
  }

  return "meaning";
}

export function getQuizLabels(quizKind: QuizKind) {
  if (quizKind === "reading") {
    return {
      main: "Reading Quiz",
      sub: "読みクイズ",
      title: "Reading Quiz",
    };
  }

  return {
    main: "Meaning Quiz",
    sub: "意味クイズ",
    title: "Meaning Quiz",
  };
}

export function getQuizHref(unit: string, quizKind: QuizKind): string {
  if (quizKind === "reading") {
    return `/kanji-reading-quiz?unit=${unit}&tier=normal&mode=normal`;
  }

  return `/kanji-quiz-test?unit=${unit}&tier=normal&mode=normal`;
}