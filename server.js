import express from "express";
import { google } from "googleapis";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sheetRange = process.env.GOOGLE_SHEET_RANGE || "A:Q";
const appTimeZone = process.env.APP_TIME_ZONE || "Europe/Moscow";

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
      today: getTodayIsoDate(),
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

app.post("/api/ask", async (request, response) => {
  try {
    const question = String(request.body?.question || "").trim();
    if (!question) {
      response.status(400).json({ error: "Вопрос пустой." });
      return;
    }

    if (!process.env.YANDEX_CLOUD_API_KEY || !process.env.YANDEX_CLOUD_FOLDER) {
      response.status(400).json({
        error: "LLM не настроена. Добавь YANDEX_CLOUD_API_KEY и YANDEX_CLOUD_FOLDER в Render Environment Variables."
      });
      return;
    }

    const entries = await loadEntries();
    const analytics = buildAnalytics(entries);
    const answer = await askLlm(question, analytics);
    response.json({ answer });
  } catch (error) {
    console.error("Failed to ask LLM:", error);
    response.status(500).json({
      error: "Не удалось получить ответ от LLM.",
      details: error.message
    });
  }
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
  if (!response.ok) throw new Error(`CSV returned ${response.status}`);
  return rowsToEntries(parseDelimited(await response.text()));
}

function rowsToEntries(rows) {
  const dataRows = rows.filter((row) => row.some((cell) => String(cell || "").trim()));
  const rowsWithoutHeader = dataRows.slice(1);
  const dates = inferEntryDates(rowsWithoutHeader.map((row) => row[0]));
  const headerMap = buildHeaderMap(dataRows[0] || []);

  return rowsWithoutHeader
    .map((row, index) => rowToEntry(row, dates[index], headerMap))
    .filter((entry) => entry.date);
}

function rowToEntry(row, normalizedDate = normalizeDate(row[0]), headerMap = null) {
  const today = getTodayIsoDate();
  if (!headerMap && row.length <= 11) {
    return rowToEntry([
      row[0],
      row[1],
      row[2],
      row[3],
      row[4],
      row[5],
      row[6],
      "нд",
      "нд",
      "нд",
      "0",
      row[7],
      "0",
      row[8],
      row[9],
      row[10],
      "0"
    ], normalizedDate, headerMap);
  }

  return {
    date: normalizedDate,
    rawDate: String(getCell(row, headerMap, ["Дата", "РґР°С‚Р°"], 0) || "").trim(),
    isToday: normalizedDate === today,
    energy: parseNumber(getCell(row, headerMap, ["Энергия", "СЌРЅРµСЂРіРёСЏ"], 1)),
    joy: parseNumber(getCell(row, headerMap, ["Радость", "СЂР°РґРѕСЃС‚СЊ"], 2)),
    interest: parseNumber(getCell(row, headerMap, ["Интерес", "РёРЅС‚РµСЂРµСЃ"], 3)),
    dayIndex: parseNumber(getCell(row, headerMap, ["Индекс дня", "Индекс", "РёРЅРґРµРєСЃ РґРЅСЏ", "РёРЅРґРµРєСЃ"], 4)),
    sleepProblem: parseBoolean(getCell(row, headerMap, ["Проблемы со сном ночью", "Сон", "РїСЂРѕР±Р»РµРјС‹ СЃРѕ СЃРЅРѕРј РЅРѕС‡СЊСЋ", "СЃРѕРЅ"], 5)),
    importantEvent: String(getCell(row, headerMap, ["Что-то важное", "Важное", "Событие", "С‡С‚Рѕ-С‚Рѕ РІР°Р¶РЅРѕРµ", "РІР°Р¶РЅРѕРµ", "СЃРѕР±С‹С‚РёРµ"], 6) || "").trim(),
    officeTrip: parseBoolean(getCell(row, headerMap, ["Поездка в офис да нет", "Поездка в офис", "Офис"], 7)),
    meetings: String(getCell(row, headerMap, ["Встречи"], 8) || "").trim(),
    cycleDay: parseNumber(getCell(row, headerMap, ["День цикла", "Цикл"], 9)),
    headache: parseNumber(getCell(row, headerMap, ["Головная боль мигрень", "Головная боль", "Мигрень"], 10)),
    medications: {
      zoloft: parseNumber(getCell(row, headerMap, ["Золофт", "Р·РѕР»РѕС„С‚"], 11)),
      fluoxetine: parseNumber(getCell(row, headerMap, ["Флуоксетин"], 12)),
      zilaxera: parseNumber(getCell(row, headerMap, ["Зилаксера", "Р·РёР»Р°РєСЃРµСЂР°"], 13)),
      tritticoAtarax: parseNumber(getCell(row, headerMap, ["Триттико Атаракс", "Триттико", "Атаракс", "С‚СЂРёС‚С‚РёРєРѕ Р°С‚Р°СЂР°РєСЃ", "С‚СЂРёС‚С‚РёРєРѕ", "Р°С‚Р°СЂР°РєСЃ"], 14)),
      lithiumMg: parseNumber(getCell(row, headerMap, ["Литий мг", "Литий", "Р»РёС‚РёР№ РјРі", "Р»РёС‚РёР№"], 15)),
      euthyroxMg: parseNumber(getCell(row, headerMap, ["Эутирокс гормоны щитовидки мг", "Эутирокс"], 16))
    }
  };

  return {
    date: normalizedDate,
    rawDate: String(getCell(row, headerMap, ["дата"], 0) || "").trim(),
    isToday: normalizedDate === today,
    energy: parseNumber(getCell(row, headerMap, ["энергия"], 1)),
    joy: parseNumber(getCell(row, headerMap, ["радость"], 2)),
    interest: parseNumber(getCell(row, headerMap, ["интерес"], 3)),
    dayIndex: parseNumber(getCell(row, headerMap, ["индекс дня", "индекс"], 4)),
    sleepProblem: parseBoolean(getCell(row, headerMap, ["проблемы со сном ночью", "сон"], 5)),
    importantEvent: String(getCell(row, headerMap, ["что-то важное", "важное", "событие"], 6) || "").trim(),
    medications: {
      zoloft: parseNumber(getCell(row, headerMap, ["золофт"], 7)),
      zilaxera: parseNumber(getCell(row, headerMap, ["зилаксера"], 8)),
      tritticoAtarax: parseNumber(getCell(row, headerMap, ["триттико атаракс", "триттико", "атаракс"], 9)),
      lithiumMg: parseNumber(getCell(row, headerMap, ["литий мг", "литий"], 10))
    }
  };
}

function buildHeaderMap(headerRow) {
  const map = new Map();
  headerRow.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (normalized) map.set(normalized, index);
  });
  return map;
}

function getCell(row, headerMap, names, fallbackIndex) {
  if (headerMap) {
    for (const name of names) {
      const exactIndex = headerMap.get(normalizeHeader(name));
      if (exactIndex !== undefined) return row[exactIndex];

      for (const [header, index] of headerMap.entries()) {
        if (header.includes(normalizeHeader(name))) return row[index];
      }
    }
  }

  return row[fallbackIndex];
}

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\\/_()[\]{}.,;:|+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDate(value) {
  return inferEntryDates([value])[0] || String(value || "").trim();
}

function inferEntryDates(values) {
  const today = getTodayIsoDate();
  const todayParts = splitIsoDate(today);
  const parsedDates = values.map((value) => parseDateParts(value));
  const lastKnownIndex = findLastIndex(parsedDates, Boolean);
  const hasMissingYears = parsedDates.some((date) => date && !date.year);
  let currentYear = todayParts.year;

  if (lastKnownIndex !== -1 && parsedDates[lastKnownIndex]?.year) {
    currentYear = parsedDates[lastKnownIndex].year;
  }

  return parsedDates.map((date, index) => {
    if (!date) return String(values[index] || "").trim();
    if (date.year) return toIsoDate(date.year, date.month, date.day);

    let year = currentYear;

    if (hasMissingYears) {
      const monthDay = date.month * 100 + date.day;
      const todayMonthDay = todayParts.month * 100 + todayParts.day;
      year = monthDay > todayMonthDay && index <= lastKnownIndex ? todayParts.year - 1 : todayParts.year;
    }

    return toIsoDate(year, date.month, date.day);
  });
}

function parseDateParts(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    return parts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const localMatch = raw.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/);
  if (localMatch) {
    const year = localMatch[3] ? normalizeYear(Number(localMatch[3])) : null;
    return parts(year, Number(localMatch[2]), Number(localMatch[1]));
  }

  const serial = Number(raw.replace(",", "."));
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30 + Math.floor(serial)));
    return parts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  return null;
}

function parts(year, month, day) {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return { year, month, day };
}

function normalizeYear(year) {
  if (year < 100) return year >= 70 ? 1900 + year : 2000 + year;
  return year;
}

function toIsoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function splitIsoDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function getTodayIsoDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: appTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function findLastIndex(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

function parseNumber(value) {
  const normalized = String(value ?? "").replace(",", ".").trim();
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseBoolean(value) {
  return ["да", "yes", "true", "1"].includes(String(value || "").trim().toLowerCase());
}

function normalizePrivateKey(key) {
  return key.replace(/\\n/g, "\n");
}

function parseDelimited(text) {
  return parseSeparatedValues(text, detectDelimiter(text));
}

function detectDelimiter(text) {
  const firstLine = String(text || "").split(/\r?\n/)[0] || "";
  const candidates = [",", "\t", ";"];
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: firstLine.split(delimiter).length
    }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function parseSeparatedValues(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
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
  const values = entries.map((entry) => entry[key]).filter(Number.isFinite);
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function formatAverage(entries, key) {
  return average(entries, key).toFixed(1);
}

function buildAnalytics(entries) {
  const validEntries = entries.filter((entry) => Number.isFinite(entry.dayIndex));
  const dayIndex = validEntries.map((entry) => entry.dayIndex);
  const sortedByIndex = [...validEntries].sort((a, b) => a.dayIndex - b.dayIndex);
  const sleepYes = validEntries.filter((entry) => entry.sleepProblem);
  const sleepNo = validEntries.filter((entry) => !entry.sleepProblem);

  return {
    period: {
      from: validEntries[0]?.date || null,
      to: validEntries.at(-1)?.date || null,
      days: validEntries.length
    },
    averages: {
      energy: round(average(validEntries, "energy"), 2),
      joy: round(average(validEntries, "joy"), 2),
      interest: round(average(validEntries, "interest"), 2),
      dayIndex: round(average(validEntries, "dayIndex"), 2)
    },
    spread: {
      minDayIndex: round(Math.min(...dayIndex), 2),
      maxDayIndex: round(Math.max(...dayIndex), 2),
      standardDeviationDayIndex: round(standardDeviation(dayIndex), 2)
    },
    correlationsWithDayIndex: {
      energy: correlationFor(validEntries, (entry) => entry.energy),
      joy: correlationFor(validEntries, (entry) => entry.joy),
      interest: correlationFor(validEntries, (entry) => entry.interest),
      sleepProblem: correlationFor(validEntries, (entry) => (entry.sleepProblem ? 1 : 0)),
      zoloft: correlationFor(validEntries, (entry) => entry.medications.zoloft),
      fluoxetine: correlationFor(validEntries, (entry) => entry.medications.fluoxetine),
      zilaxera: correlationFor(validEntries, (entry) => entry.medications.zilaxera),
      tritticoAtarax: correlationFor(validEntries, (entry) => entry.medications.tritticoAtarax),
      lithiumMg: correlationFor(validEntries, (entry) => entry.medications.lithiumMg),
      euthyroxMg: correlationFor(validEntries, (entry) => entry.medications.euthyroxMg),
      officeTrip: correlationFor(validEntries, (entry) => (entry.officeTrip ? 1 : 0)),
      meetings: correlationFor(validEntries, (entry) => (hasFilledText(entry.meetings) ? 1 : 0)),
      cycleDay: correlationFor(validEntries, (entry) => entry.cycleDay),
      headache: correlationFor(validEntries, (entry) => entry.headache)
    },
    laggedCorrelationsWithDayIndex: {
      meetings: buildLaggedCorrelations(validEntries, (entry) => (hasFilledText(entry.meetings) ? 1 : 0), [0, 1, 2]),
      importantEvent: buildLaggedCorrelations(validEntries, (entry) => (hasFilledText(entry.importantEvent) ? 1 : 0), [0, 1, 2]),
      officeTrip: buildLaggedCorrelations(validEntries, (entry) => (entry.officeTrip ? 1 : 0), [0, 1, 2])
    },
    sleepComparison: {
      daysWithSleepProblem: sleepYes.length,
      daysWithoutSleepProblem: sleepNo.length,
      averageDayIndexWithSleepProblem: sleepYes.length ? round(average(sleepYes, "dayIndex"), 2) : null,
      averageDayIndexWithoutSleepProblem: sleepNo.length ? round(average(sleepNo, "dayIndex"), 2) : null,
      difference: sleepYes.length && sleepNo.length ? round(average(sleepYes, "dayIndex") - average(sleepNo, "dayIndex"), 2) : null
    },
    trend: {
      fullPeriodSlopePerDay: round(linearSlope(dayIndex), 4),
      last14AverageDayIndex: round(average(validEntries.slice(-14), "dayIndex"), 2),
      previous14AverageDayIndex: round(average(validEntries.slice(-28, -14), "dayIndex"), 2)
    },
    lowestDays: sortedByIndex.slice(0, 5).map(compactEntry),
    highestDays: sortedByIndex.slice(-5).reverse().map(compactEntry),
    medicationChanges: findMedicationChanges(validEntries),
    importantEvents: validEntries
      .filter((entry) => entry.importantEvent && entry.importantEvent.toLowerCase() !== "нет")
      .map((entry) => ({ date: entry.date, event: entry.importantEvent, dayIndex: entry.dayIndex }))
      .slice(-20)
  };
}

function compactEntry(entry) {
  return {
    date: entry.date,
    dayIndex: entry.dayIndex,
    energy: entry.energy,
    joy: entry.joy,
    interest: entry.interest,
    sleepProblem: entry.sleepProblem,
    importantEvent: entry.importantEvent,
    officeTrip: entry.officeTrip,
    meetings: entry.meetings,
    cycleDay: entry.cycleDay,
    headache: entry.headache
  };
}

function correlationFor(entries, getValue) {
  const pairs = entries
    .map((entry) => [getValue(entry), entry.dayIndex])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

  if (pairs.length < 3) return { r: null, n: pairs.length, note: "Недостаточно точек" };
  const xValues = pairs.map(([x]) => x);
  if (new Set(xValues).size < 2) return { r: null, n: pairs.length, note: "Значение не менялось" };
  return { r: round(pearson(pairs), 3), n: pairs.length };
}

function buildLaggedCorrelations(entries, getValue, lags) {
  const byDate = new Map(entries.filter((entry) => entry.date).map((entry) => [entry.date, entry]));
  return Object.fromEntries(
    lags.map((lag) => {
      const pairs = entries
        .map((entry) => {
          if (!entry.date) return null;
          const targetEntry = byDate.get(addDaysIso(entry.date, lag));
          return targetEntry ? [getValue(entry), targetEntry.dayIndex] : null;
        })
        .filter((pair) => pair && Number.isFinite(pair[0]) && Number.isFinite(pair[1]));

      if (pairs.length < 3) return [`dayPlus${lag}`, { r: null, n: pairs.length, note: "Недостаточно точек" }];
      if (new Set(pairs.map(([x]) => x)).size < 2) return [`dayPlus${lag}`, { r: null, n: pairs.length, note: "Значение не менялось" }];
      return [`dayPlus${lag}`, { r: round(pearson(pairs), 3), n: pairs.length }];
    })
  );
}

function addDaysIso(date, days) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function hasFilledText(value) {
  const text = String(value || "").trim().toLowerCase();
  return Boolean(text && !["нет", "нд", "no", "n/a", "-"].includes(text));
}

function pearson(pairs) {
  const n = pairs.length;
  const meanX = pairs.reduce((sum, [x]) => sum + x, 0) / n;
  const meanY = pairs.reduce((sum, [, y]) => sum + y, 0) / n;
  let numerator = 0;
  let xSum = 0;
  let ySum = 0;

  for (const [x, y] of pairs) {
    const dx = x - meanX;
    const dy = y - meanY;
    numerator += dx * dy;
    xSum += dx * dx;
    ySum += dy * dy;
  }

  const denominator = Math.sqrt(xSum * ySum);
  return denominator ? numerator / denominator : null;
}

function standardDeviation(values) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function linearSlope(values) {
  const pairs = values.map((value, index) => [index, value]);
  return pearsonSlope(pairs);
}

function pearsonSlope(pairs) {
  if (pairs.length < 2) return 0;
  const n = pairs.length;
  const meanX = pairs.reduce((sum, [x]) => sum + x, 0) / n;
  const meanY = pairs.reduce((sum, [, y]) => sum + y, 0) / n;
  const numerator = pairs.reduce((sum, [x, y]) => sum + (x - meanX) * (y - meanY), 0);
  const denominator = pairs.reduce((sum, [x]) => sum + (x - meanX) ** 2, 0);
  return denominator ? numerator / denominator : 0;
}

function findMedicationChanges(entries) {
  const fields = [
    ["fluoxetine", "Флуоксетин"],
    ["euthyroxMg", "Эутирокс"],
    ["zoloft", "Золофт"],
    ["zilaxera", "Зилаксера"],
    ["tritticoAtarax", "Триттико / Атаракс"],
    ["lithiumMg", "Литий"]
  ];
  const changes = [];

  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const current = entries[index];

    for (const [field, label] of fields) {
      const before = previous.medications[field];
      const after = current.medications[field];
      if (before !== after) {
        changes.push({
          date: current.date,
          medication: label,
          before,
          after,
          dayIndexOnChangeDay: current.dayIndex,
          averageBefore7Days: round(average(entries.slice(Math.max(0, index - 7), index), "dayIndex"), 2),
          averageAfter7Days: round(average(entries.slice(index, index + 7), "dayIndex"), 2)
        });
      }
    }
  }

  return changes;
}

function buildLocalReport(entries) {
  const analytics = buildAnalytics(entries);
  const sleep = analytics.sleepComparison;

  return [
    `Период: ${analytics.period.from || "-"} - ${analytics.period.to || "-"}`,
    "",
    "Краткое резюме:",
    `Средний индекс дня: ${analytics.averages.dayIndex}. Энергия: ${analytics.averages.energy}, радость: ${analytics.averages.joy}, интерес: ${analytics.averages.interest}.`,
    "",
    "Сон:",
    `Проблемы со сном отмечены ${sleep.daysWithSleepProblem} раз(а).`,
    sleep.averageDayIndexWithSleepProblem === null
      ? "Недостаточно дней с проблемами сна для сравнения."
      : `Средний индекс при проблемах со сном: ${sleep.averageDayIndexWithSleepProblem}; без проблем со сном: ${sleep.averageDayIndexWithoutSleepProblem}.`,
    "",
    "Корреляции с индексом дня:",
    `Энергия: ${formatCorrelation(analytics.correlationsWithDayIndex.energy)}.`,
    `Радость: ${formatCorrelation(analytics.correlationsWithDayIndex.joy)}.`,
    `Интерес: ${formatCorrelation(analytics.correlationsWithDayIndex.interest)}.`,
    "",
    "Вопросы к врачу:",
    "Есть ли смысл отдельно отслеживать тревогу, раздражительность, сон в часах и побочные эффекты?",
    "Какие изменения самочувствия важнее всего приносить на прием?"
  ].join("\n");
}

function formatCorrelation(result) {
  if (result.r === null) return result.note || "нельзя посчитать";
  return `r=${result.r}, n=${result.n}`;
}

function buildMedicationSummary(entries) {
  const latest = entries.at(-1)?.medications;
  if (!latest) return "Недостаточно данных по лекарствам.";

  return `Последняя запись: Золофт ${latest.zoloft}, Зилаксера ${latest.zilaxera}, Триттико / Атаракс ${latest.tritticoAtarax}, литий ${latest.lithiumMg} мг. Изменения дозировок стоит обсуждать только с врачом.`;
}

async function askLlm(question, analytics) {
  const folder = process.env.YANDEX_CLOUD_FOLDER;
  const model = process.env.YANDEX_CLOUD_MODEL || "gpt-oss-120b/latest";
  const client = new OpenAI({
    apiKey: process.env.YANDEX_CLOUD_API_KEY,
    baseURL: process.env.YANDEX_CLOUD_BASE_URL || "https://ai.api.cloud.yandex.net/v1",
    project: folder
  });

  const response = await client.responses.create({
    model: `gpt://${folder}/${model}`,
    temperature: 0.2,
    max_output_tokens: 900,
    instructions: [
      "Ты аналитик дневника самочувствия. Отвечай на основе рассчитанной статистики, а не пересказывай строки таблицы.",
      "Если вопрос про связь факторов, обязательно используй корреляции r, размер выборки n, сравнение средних или тренд из analytics.",
      "Если вопрос про влияние встреч, событий или поездок на последующие дни, смотри laggedCorrelationsWithDayIndex: dayPlus0, dayPlus1 и dayPlus2.",
      "Не выводи JSON, Markdown-таблицы, заголовки с #, списки со звездочками и блоки кода.",
      "Пиши обычным русским текстом, короткими абзацами. Допустимы строки вида '1. ...', '2. ...'.",
      "Не ставь диагнозы, не назначай лечение, не советуй менять дозировки.",
      "Разделяй факт из данных и осторожную интерпретацию. Если данных мало или фактор не менялся, скажи это прямо."
    ].join("\n"),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              `Вопрос пользователя: ${question}`,
              "",
              "Предварительно рассчитанная аналитика:",
              JSON.stringify(analytics, null, 2)
            ].join("\n")
          }
        ]
      }
    ]
  });

  return sanitizeLlmAnswer(response.output_text);
}

function sanitizeLlmAnswer(text) {
  return String(text || "")
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .trim();
}

app.listen(port, () => {
  console.log(`Mood dashboard is running on port ${port}`);
});
