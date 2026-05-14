const chartEl = document.querySelector("#chart");
const medicationsEl = document.querySelector("#medications");
const reportEl = document.querySelector("#report");
const reportButton = document.querySelector("#reportButton");
const askForm = document.querySelector("#askForm");
const questionInput = document.querySelector("#questionInput");
const answerEl = document.querySelector("#answer");
const chartOptions = Array.from(document.querySelectorAll(".chart-option"));

const chartLabels = {
  dayIndex: "индекс",
  energy: "энергия",
  joy: "радость",
  interest: "интерес"
};

let activeChartKey = "dayIndex";
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
  document.querySelector("#periodLabel").textContent = `${formatDate(rows[0])} - ${formatDate(rows.at(-1))}`;
}

function renderChart(rows, key = activeChartKey) {
  const chartRows = rows.filter((row) => Number.isFinite(row[key]));
  chartEl.style.setProperty("--count", Math.max(chartRows.length, 1));
  chartEl.innerHTML = chartRows.map((row) => renderBar(row, key)).join("");
}

function renderBar(row, key) {
  const value = row[key];
  const event = getImportantEvent(row);
  const titleParts = [`${formatDate(row)}: ${chartLabels[key]} ${value}`];
  if (event) titleParts.push(event);

  return `
    <div class="bar" style="--value: ${value}" data-sleep="${row.sleepProblem}" title="${escapeHtml(titleParts.join(" · "))}">
      ${event ? `<span class="event-note">${escapeHtml(event)}</span>` : ""}
      <span class="bar-value">${value}</span>
      <small>${formatShortDate(row)}</small>
    </div>
  `;
}

function getImportantEvent(row) {
  const event = String(row.importantEvent || "").trim();
  if (!event || event.toLowerCase() === "нет") return "";
  return event;
}

function formatDate(row) {
  if (!row?.date) return "-";
  return row.isToday ? `Сегодня (${row.date})` : row.date;
}

function formatShortDate(row) {
  if (!row?.date) return "-";
  return row.isToday ? "сегодня" : row.date.slice(5);
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
  const eligibleRows = rows.filter((row) => !currentDate || row.date <= currentDate);
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

function bindChartControls() {
  chartOptions.forEach((button) => {
    button.addEventListener("click", () => {
      activeChartKey = button.dataset.chartKey;
      chartOptions.forEach((option) => option.classList.toggle("is-active", option === button));
      renderChart(currentRows, activeChartKey);
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function init() {
  bindChartControls();

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
