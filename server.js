import express from "express";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sheetRange = process.env.GOOGLE_SHEET_RANGE || "A:K";

const sampleEntries = [
  rowToEntry(["29.12.2025", "6", "3", "5", "4,7", "Нет", "нет", "200", "5", "0", "0"]),
  rowToEntry(["30.12.2025", "3", "2", "2", "2,3", "Да", "нет", "200", "5", "0", "0"]),
  rowToEntry(["31.12.2025", "4", "3", "3", "3,3", "Нет", "нет", "200", "5", "0", "0"]),
  rowToEntry(["01.01.2026", "4", "5", "4", "4,3", "Нет", "нет", "200", "5", "0", "0"]),
  rowToEntry(["02.01.2026", "4", "5", "3", "4,0", "Нет", "нет", "200", "5", "0", "0"]),
  rowToEntry(["03.01.2026", "3", "4", "2", "3,0", "Нет", "нет", "200", "5", "0", "0"]),
  rowToEntry(["04.01.2026", "5", "3", "3", "3,7", "Нет", "нет", "200", "5", "0", "0"]),
  rowToEntry(["05.01.2026", "4", "3", "3", "3,3", "Нет", "нет", "200", "5", "0", "0"]),
  rowToEntry(["06.01.2026", "3", "4", "3", "3,3", "Нет", "нет", "200", "5", "0", "0"]),
  rowToEntry(["07.01.2026", "4", "4", "4", "4,0", "Нет", "нет", "200", "5", "0", "0"])
];

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (request, response) => {
  response.json({ ok: true });
});

app.get("/api/entries", async (request, response) => {
  try {
    const entries = await loadEntries();
    response.json({
      source: getConfiguredSourceName(),
      entries
    });
  } catch (error) {
    console.error("Failed to load entries:", error);
    response.status(500).json({
      error: "Не удалось загрузить данные из таблицы.",
      details: error.message
    });
  }
});

app.post("/api/report", async (request, response) => {
  const entries = Array.isArray(request.body?.entries) ? request.body.entries : sampleEntries;
  response.json({ report: buildLocalReport(entries) });
});

async function loadEntries() {
  if (process.env.GOOGLE_SHEET_CSV_URL) {
    return loadEntriesFromCsv(process.env.GOOGLE_SHEET_CSV_URL);
  }

  if (process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return loadEntriesFromGoogleApi();
  }

  return sampleEntries;
}

function getConfiguredSourceName() {
  if (process.env.GOOGLE_SHEET_CSV_URL) return "Google Sheets CSV";
  if (process.env.GOOGLE_SHEET_ID) return "Google Sheets API";
  return "Демо-данные";
}

async function loadEntriesFromGoogleApi() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });

  const sheets = google.sheets({ version: "v4", auth });
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: sheetRange
  });

  return rowsToEntries(result.data.values || []);
}

async function loadEntriesFromCsv(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CSV returned ${response.status}`);
  }

  const csv = await response.text();
  return rowsToEntries(parseCsv(csv));
}

function rowsToEntries(rows) {
  const dataRows = rows.filter((row) => row.some((cell) => String(cell || "").trim()));
  const withoutHeader = dataRows.slice(1);
  return withoutHeader.map(rowToEntry).filter((entry) => entry.date);
}

function rowToEntry(row) {
  return {
    date: normalizeDate(row[0]),
    energy: parseNumber(row[1]),
    joy: parseNumber(row[2]),
    interest: parseNumber(row[3]),
    dayIndex: parseNumber(row[4]),
    sleepProblem: parseBoolean(row[5]),
    importantEvent: String(row[6] || "").trim(),
    medications: {
      zoloft: parseNumber(row[7]),
      zilaxera: parseNumber(row[8]),
      tritticoAtarax: parseNumber(row[9]),
      lithiumMg: parseNumber(row[10])
    }
  };
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return raw;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function parseNumber(value) {
  const normalized = String(value ?? "").replace(",", ".").trim();
  if (!normalized) return 0;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function parseBoolean(value) {
  return ["да", "yes", "true", "1"].includes(String(value || "").trim().toLowerCase());
}

function normalizePrivateKey(key) {
  return key.replace(/\\n/g, "\n");
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

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
    buildMedicationSummary(entries),
    "",
    "Вопросы к врачу:",
    "- Есть ли связь между сном и снижением индекса дня?",
    "- Стоит ли отдельно отслеживать тревогу, раздражительность и побочные эффекты?",
    "- Достаточно ли текущих метрик для оценки динамики лечения?"
  ].join("\n");
}

function buildMedicationSummary(entries) {
  const latest = entries.at(-1)?.medications;
  if (!latest) return "Недостаточно данных по лекарствам.";

  return `Последняя запись: Золофт ${latest.zoloft}, Зилаксера ${latest.zilaxera}, Триттико / Атаракс ${latest.tritticoAtarax}, литий ${latest.lithiumMg} мг. Изменения дозировок стоит обсуждать только с врачом.`;
}

app.listen(port, () => {
  console.log(`Mood dashboard is running on port ${port}`);
});
