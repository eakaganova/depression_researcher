import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sampleEntries = [
  {
    date: "2025-12-29",
    energy: 6,
    joy: 3,
    interest: 5,
    dayIndex: 4.7,
    sleepProblem: false,
    importantEvent: "нет",
    medications: { zoloft: 200, zilaxera: 5, tritticoAtarax: 0, lithiumMg: 0 }
  },
  {
    date: "2025-12-30",
    energy: 3,
    joy: 2,
    interest: 2,
    dayIndex: 2.3,
    sleepProblem: true,
    importantEvent: "нет",
    medications: { zoloft: 200, zilaxera: 5, tritticoAtarax: 0, lithiumMg: 0 }
  },
  {
    date: "2025-12-31",
    energy: 4,
    joy: 3,
    interest: 3,
    dayIndex: 3.3,
    sleepProblem: false,
    importantEvent: "нет",
    medications: { zoloft: 200, zilaxera: 5, tritticoAtarax: 0, lithiumMg: 0 }
  },
  {
    date: "2026-01-01",
    energy: 4,
    joy: 5,
    interest: 4,
    dayIndex: 4.3,
    sleepProblem: false,
    importantEvent: "нет",
    medications: { zoloft: 200, zilaxera: 5, tritticoAtarax: 0, lithiumMg: 0 }
  },
  {
    date: "2026-01-02",
    energy: 4,
    joy: 5,
    interest: 3,
    dayIndex: 4,
    sleepProblem: false,
    importantEvent: "нет",
    medications: { zoloft: 200, zilaxera: 5, tritticoAtarax: 0, lithiumMg: 0 }
  },
  {
    date: "2026-01-03",
    energy: 3,
    joy: 4,
    interest: 2,
    dayIndex: 3,
    sleepProblem: false,
    importantEvent: "нет",
    medications: { zoloft: 200, zilaxera: 5, tritticoAtarax: 0, lithiumMg: 0 }
  },
  {
    date: "2026-01-04",
    energy: 5,
    joy: 3,
    interest: 3,
    dayIndex: 3.7,
    sleepProblem: false,
    importantEvent: "нет",
    medications: { zoloft: 200, zilaxera: 5, tritticoAtarax: 0, lithiumMg: 0 }
  },
  {
    date: "2026-01-05",
    energy: 4,
    joy: 3,
    interest: 3,
    dayIndex: 3.3,
    sleepProblem: false,
    importantEvent: "нет",
    medications: { zoloft: 200, zilaxera: 5, tritticoAtarax: 0, lithiumMg: 0 }
  },
  {
    date: "2026-01-06",
    energy: 3,
    joy: 4,
    interest: 3,
    dayIndex: 3.3,
    sleepProblem: false,
    importantEvent: "нет",
    medications: { zoloft: 200, zilaxera: 5, tritticoAtarax: 0, lithiumMg: 0 }
  },
  {
    date: "2026-01-07",
    energy: 4,
    joy: 4,
    interest: 4,
    dayIndex: 4,
    sleepProblem: false,
    importantEvent: "нет",
    medications: { zoloft: 200, zilaxera: 5, tritticoAtarax: 0, lithiumMg: 0 }
  }
];

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (request, response) => {
  response.json({ ok: true });
});

app.get("/api/entries", async (request, response) => {
  response.json(sampleEntries);
});

app.post("/api/report", async (request, response) => {
  const entries = Array.isArray(request.body?.entries) ? request.body.entries : sampleEntries;
  response.json({ report: buildLocalReport(entries) });
});

function average(entries, key) {
  if (!entries.length) return 0;
  return entries.reduce((total, entry) => total + Number(entry[key] || 0), 0) / entries.length;
}

function formatAverage(entries, key) {
  return average(entries, key).toFixed(1);
}

function buildLocalReport(entries) {
  const sleepProblemDays = entries.filter((entry) => entry.sleepProblem);
  const sortedByIndex = [...entries].sort((a, b) => a.dayIndex - b.dayIndex);
  const worstDay = sortedByIndex[0];
  const bestDay = sortedByIndex.at(-1);

  return [
    `Период: ${entries[0]?.date || "-"} - ${entries.at(-1)?.date || "-"}`,
    "",
    "Краткое резюме:",
    `Средний индекс дня: ${formatAverage(entries, "dayIndex")}. Энергия: ${formatAverage(entries, "energy")}, радость: ${formatAverage(entries, "joy")}, интерес: ${formatAverage(entries, "interest")}.`,
    "",
    "Сон:",
    `Проблемы со сном отмечены ${sleepProblemDays.length} раз(а).`,
    sleepProblemDays.length ? `Дни с проблемами сна: ${sleepProblemDays.map((entry) => entry.date).join(", ")}.` : "В выбранном периоде проблем со сном не отмечено.",
    "",
    "Лучшие и худшие дни:",
    bestDay ? `Лучший день по индексу: ${bestDay.date}, индекс ${bestDay.dayIndex}.` : "Недостаточно данных.",
    worstDay ? `Самый сложный день по индексу: ${worstDay.date}, индекс ${worstDay.dayIndex}.` : "Недостаточно данных.",
    "",
    "Лекарства:",
    "В периоде отслеживаются Золофт, Зилаксера, Триттико / Атаракс и литий. Изменений дозировок в демо-данных нет.",
    "",
    "Вопросы к врачу:",
    "- Есть ли связь между сном и снижением индекса дня?",
    "- Стоит ли отдельно отслеживать тревогу, раздражительность и побочные эффекты?",
    "- Достаточно ли текущих метрик для оценки динамики лечения?"
  ].join("\n");
}

app.listen(port, () => {
  console.log(`Mood dashboard is running on port ${port}`);
});
