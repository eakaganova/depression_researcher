const chartEl = document.querySelector("#chart");
const medicationsEl = document.querySelector("#medications");
const reportEl = document.querySelector("#report");
const reportButton = document.querySelector("#reportButton");
const askForm = document.querySelector("#askForm");
const questionInput = document.querySelector("#questionInput");
const answerEl = document.querySelector("#answer");
const comparisonCardsEl = document.querySelector("#comparisonCards");
const comparisonTitleEl = document.querySelector("#comparisonTitle");
const comparisonPeriodEl = document.querySelector("#comparisonPeriod");

const series = [
  { key: "energy", label: "Энергия", color: "#236f5d" },
  { key: "joy", label: "Радость", color: "#b45b73" },
  { key: "interest", label: "Интерес", color: "#4d7fa3" }
];
const chartMinValue = 0;
const chartMaxValue = 10;

let currentRows = [];

function average(rows, key) {
  const values = rows.map((row) => row[key]).filter(Number.isFinite);
  if (!values.length) return "-";
  const sum = values.reduce((total, value) => total + value, 0);
  return (sum / values.length).toFixed(1);
}

function renderMetrics(rows, source) {
  document.querySelector("#energy").textContent = average(rows, "energy");
  document.querySelector("#joy").textContent = average(rows, "joy");
  document.querySelector("#interest").textContent = average(rows, "interest");
  document.querySelector("#dayIndex").textContent = average(rows, "dayIndex");
  document.querySelector("#sourceLabel").textContent = `${source} · ${rows.length} записей`;
  document.querySelector("#periodLabel").textContent = `${formatShortDate(rows[0])} - ${formatShortDate(rows.at(-1))}`;
}

function renderChart(rows) {
  const chartRows = rows.filter((row) => series.some((item) => Number.isFinite(row[item.key])));
  if (!chartRows.length) {
    chartEl.textContent = "Нет данных для графика.";
    return;
  }

  const width = Math.max(860, chartRows.length * 18);
  const height = 360;
  const padding = { top: 46, right: 28, bottom: 52, left: 36 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const x = (index) => padding.left + (chartRows.length === 1 ? 0 : (index / (chartRows.length - 1)) * plotWidth);
  const y = (value) => {
    const clamped = Math.min(chartMaxValue, Math.max(chartMinValue, value));
    return padding.top + plotHeight - ((clamped - chartMinValue) / (chartMaxValue - chartMinValue)) * plotHeight;
  };

  const grid = [0, 2, 4, 6, 8, 10]
    .map(
      (value) => `
        <line class="grid-line" x1="${padding.left}" x2="${width - padding.right}" y1="${y(value)}" y2="${y(value)}"></line>
        <text class="axis-label" x="8" y="${y(value) + 4}">${value}</text>
      `
    )
    .join("");

  const lines = series.map((item) => renderSeries(item, chartRows, x, y)).join("");
  const events = chartRows.map((row, index) => renderEvent(row, x(index), padding.top, height - padding.bottom)).join("");
  const dates = chartRows.map((row, index) => renderDate(row, index, chartRows.length, x(index), height)).join("");

  chartEl.innerHTML = `
    <div class="line-chart-scroll">
      <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">
        ${grid}
        ${events}
        ${lines}
        ${dates}
      </svg>
    </div>
  `;
}

function renderSeries(item, rows, x, y) {
  const points = rows
    .map((row, index) => (Number.isFinite(row[item.key]) ? { row, index, value: row[item.key] } : null))
    .filter(Boolean);
  const path = buildSmoothPath(points.map((point) => [x(point.index), y(point.value)]));
  const dots = points
    .map(
      (point) => `
        <circle class="line-dot" cx="${x(point.index)}" cy="${y(point.value)}" r="4" fill="${item.color}">
          <title>${formatDate(point.row)} · ${item.label}: ${point.value}</title>
        </circle>
      `
    )
    .join("");

  return `
    <path class="line-path" d="${path}" stroke="${item.color}"></path>
    ${dots}
  `;
}

function buildSmoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;

  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let index = 1; index < points.length; index += 1) {
    const [prevX, prevY] = points[index - 1];
    const [x, y] = points[index];
    const controlOffset = (x - prevX) / 2;
    path += ` C ${prevX + controlOffset} ${prevY}, ${x - controlOffset} ${y}, ${x} ${y}`;
  }
  return path;
}

function renderEvent(row, x, top, bottom) {
  const event = getImportantEvent(row);
  if (!event) return "";

  return `
    <g class="event-marker-svg">
      <line x1="${x}" x2="${x}" y1="${top}" y2="${bottom}"></line>
      <circle cx="${x}" cy="${top + 8}" r="5"></circle>
      <rect class="event-tooltip-bg" x="${x - 108}" y="${top - 40}" width="216" height="30" rx="8"></rect>
      <text class="event-tooltip-text" x="${x}" y="${top - 20}">${escapeSvgText(shortenEvent(event))}</text>
      <title>${escapeHtml(event)}</title>
    </g>
  `;
}

function shortenEvent(event) {
  return event.length > 34 ? `${event.slice(0, 31)}...` : event;
}

function escapeSvgText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderDate(row, index, total, x, height) {
  const step = total > 80 ? 10 : total > 45 ? 6 : total > 25 ? 3 : 1;
  if (index % step !== 0 && !row.isToday) return "";

  return `<text class="date-label" x="${x}" y="${height - 14}" transform="rotate(-35 ${x} ${height - 14})">${formatShortDate(row)}</text>`;
}

function getImportantEvent(row) {
  const event = String(row.importantEvent || "").trim();
  if (!event || event.toLowerCase() === "нет") return "";
  return event;
}

function formatDate(row) {
  if (!row?.date) return "-";
  return row.isToday ? `Сегодня (${formatShortDate(row)})` : formatShortDate(row);
}

function formatShortDate(row) {
  if (!row?.date) return "-";
  const parts = row.date.split("-");
  if (parts.length !== 3) return row.date;
  return `${parts[2]}.${parts[1]}`;
}

function renderMedications(rows) {
  const latest = getMedicationSnapshot(rows);
  const items = [
    ["Золофт", latest.zoloft],
    ["Зилаксера", latest.zilaxera],
    ["Триттико / Атаракс", latest.tritticoAtarax],
    ["Литий", latest.lithiumMg === null ? null : `${latest.lithiumMg} мг`]
  ];

  medicationsEl.innerHTML = items
    .map(
      ([name, value]) => `
        <div class="med-row">
          <span>${name}</span>
          <strong>${value ?? "-"}</strong>
        </div>
      `
    )
    .join("");
}

function getMedicationSnapshot(rows) {
  const todayRow = rows.find((row) => row.isToday);
  const currentDate = todayRow?.date || rows.at(-1)?.date;
  return getMedicationSnapshotAtDate(rows, currentDate);
}

function getMedicationSnapshotAtDate(rows, date) {
  const eligibleRows = rows.filter((row) => !date || row.date <= date);
  const snapshot = {
    zoloft: null,
    zilaxera: null,
    tritticoAtarax: null,
    lithiumMg: null
  };

  for (const row of eligibleRows) {
    for (const key of Object.keys(snapshot)) {
      const value = row.medications?.[key];
      if (Number.isFinite(value)) snapshot[key] = value;
    }
  }

  return snapshot;
}

function renderMonthlyComparison(rows, today) {
  const currentMonthKey = String(today || rows.at(-1)?.date || "").slice(0, 7);
  const januaryKey = "2026-01";
  const januaryRows = rows.filter((row) => row.date?.startsWith(januaryKey));
  const currentRows = rows.filter((row) => row.date?.startsWith(currentMonthKey) && (!today || row.date <= today));
  const currentMonthName = getMonthName(currentMonthKey);

  comparisonTitleEl.textContent = `Январь и ${currentMonthName}`;
  comparisonPeriodEl.textContent = `${januaryRows.length} дн. · ${currentRows.length} дн.`;

  if (!januaryRows.length || !currentRows.length) {
    comparisonCardsEl.innerHTML = '<p class="empty-state">Недостаточно данных для сравнения января с текущим месяцем.</p>';
    return;
  }

  const metricCards = [
    createMetricComparisonCard("Энергия", januaryRows, currentRows, "energy"),
    createMetricComparisonCard("Радость", januaryRows, currentRows, "joy"),
    createMetricComparisonCard("Интерес", januaryRows, currentRows, "interest"),
    createSleepComparisonCard(januaryRows, currentRows),
    createMedicationComparisonCard(rows, januaryRows, currentRows)
  ];

  comparisonCardsEl.innerHTML = metricCards.join("");
}

function createMetricComparisonCard(label, baselineRows, currentRows, key) {
  const before = numericAverage(baselineRows, key);
  const after = numericAverage(currentRows, key);
  const difference = after - before;
  const changeLabel = Math.abs(difference) < 0.05
    ? "не изменилась"
    : difference > 0
      ? `выросла на ${difference.toFixed(1)}`
      : `снизилась на ${Math.abs(difference).toFixed(1)}`;
  const tone = difference > 0.05 ? "positive" : difference < -0.05 ? "negative" : "neutral";

  return `
    <article class="comparison-card ${tone}">
      <span>${label} в среднем</span>
      <strong>${changeLabel}</strong>
      <small>Январь ${before.toFixed(1)} → сейчас ${after.toFixed(1)}</small>
    </article>
  `;
}

function createSleepComparisonCard(baselineRows, currentRows) {
  const before = baselineRows.filter((row) => row.sleepProblem).length;
  const after = currentRows.filter((row) => row.sleepProblem).length;
  const changeLabel = after === before
    ? "без изменений"
    : after < before
      ? `реже на ${before - after} дн.`
      : `чаще на ${after - before} дн.`;

  return `
    <article class="comparison-card ${after < before ? "positive" : after > before ? "negative" : "neutral"}">
      <span>Проблемы со сном</span>
      <strong>${changeLabel}</strong>
      <small>Январь ${before} дн. → сейчас ${after} дн.</small>
    </article>
  `;
}

function createMedicationComparisonCard(rows, baselineRows, currentRows) {
  const before = getMedicationSnapshotAtDate(rows, baselineRows.at(-1)?.date);
  const after = getMedicationSnapshotAtDate(rows, currentRows.at(-1)?.date);
  const labels = {
    zoloft: "Золофт",
    zilaxera: "Зилаксера",
    tritticoAtarax: "Триттико / Атаракс",
    lithiumMg: "Литий"
  };
  const changes = Object.keys(labels)
    .filter((key) => before[key] !== after[key])
    .map((key) => `${labels[key]}: ${formatMedicationValue(key, before[key])} → ${formatMedicationValue(key, after[key])}`);
  const text = changes.length ? changes.join("; ") : "Без изменений";

  return `
    <article class="comparison-card medication-comparison ${changes.length ? "changed" : "neutral"}">
      <span>Препараты</span>
      <strong>${text}</strong>
      <small>На конец января → на текущую дату</small>
    </article>
  `;
}

function numericAverage(rows, key) {
  const values = rows.map((row) => row[key]).filter(Number.isFinite);
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatMedicationValue(key, value) {
  if (!Number.isFinite(value)) return "-";
  return key === "lithiumMg" ? `${value} мг` : `${value}`;
}

function getMonthName(monthKey) {
  const month = Number(monthKey.split("-")[1]);
  const names = [
    "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"
  ];
  return names[month - 1] || "текущий месяц";
}

async function createReport(rows) {
  reportButton.disabled = true;
  reportButton.textContent = "Собираю...";

  try {
    const response = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: rows })
    });
    const data = await response.json();
    reportEl.textContent = data.report;
  } finally {
    reportButton.disabled = false;
    reportButton.textContent = "Сформировать отчет";
  }
}

async function askQuestion(question) {
  const askButton = document.querySelector("#askButton");
  askButton.disabled = true;
  askButton.textContent = "Считаю...";
  answerEl.textContent = "Считаю статистику и спрашиваю модель...";

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.details || data.error || "Не удалось получить ответ");
    }

    answerEl.textContent = data.answer;
  } catch (error) {
    answerEl.textContent = `Ошибка: ${error.message}`;
  } finally {
    askButton.disabled = false;
    askButton.textContent = "Спросить";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function init() {
  try {
    const response = await fetch("/api/entries");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.details || data.error || "Не удалось загрузить данные");
    }

    currentRows = data.entries || [];

    renderMetrics(currentRows, data.source || "-");
    renderChart(currentRows);
    renderMedications(currentRows);
    renderMonthlyComparison(currentRows, data.today);

    reportButton.addEventListener("click", () => createReport(currentRows));
    askForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const question = questionInput.value.trim();
      if (!question) return;
      askQuestion(question);
    });
  } catch (error) {
    reportEl.textContent = `Ошибка загрузки данных: ${error.message}`;
    answerEl.textContent = "Данные не загрузились, поэтому вопросы пока недоступны.";
  }
}

init();
