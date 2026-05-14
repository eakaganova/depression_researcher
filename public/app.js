const chartEl = document.querySelector("#chart");
const medicationsEl = document.querySelector("#medications");
const reportEl = document.querySelector("#report");
const reportButton = document.querySelector("#reportButton");
const askForm = document.querySelector("#askForm");
const questionInput = document.querySelector("#questionInput");
const answerEl = document.querySelector("#answer");

function average(rows, key) {
  if (!rows.length) return "-";
  const sum = rows.reduce((total, row) => total + Number(row[key] || 0), 0);
  return (sum / rows.length).toFixed(1);
}

function renderMetrics(rows, source) {
  document.querySelector("#energy").textContent = average(rows, "energy");
  document.querySelector("#joy").textContent = average(rows, "joy");
  document.querySelector("#interest").textContent = average(rows, "interest");
  document.querySelector("#dayIndex").textContent = average(rows, "dayIndex");
  document.querySelector("#sourceLabel").textContent = `${source} · ${rows.length} записей`;
  document.querySelector("#periodLabel").textContent = `${rows[0]?.date || "-"} - ${rows.at(-1)?.date || "-"}`;
}

function renderChart(rows) {
  chartEl.style.setProperty("--count", Math.max(rows.length, 1));
  chartEl.innerHTML = rows
    .map(
      (row) => `
        <div class="bar" style="--value: ${row.dayIndex}" data-sleep="${row.sleepProblem}" title="${row.date}: индекс ${row.dayIndex}">
          <span>${row.dayIndex}</span>
          <small>${row.date.slice(5)}</small>
        </div>
      `
    )
    .join("");
}

function renderMedications(rows) {
  const latest = rows.at(-1)?.medications || {};
  const items = [
    ["Золофт", latest.zoloft],
    ["Зилаксера", latest.zilaxera],
    ["Триттико / Атаракс", latest.tritticoAtarax],
    ["Литий", `${latest.lithiumMg ?? 0} мг`]
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

async function init() {
  try {
    const response = await fetch("/api/entries");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.details || data.error || "Не удалось загрузить данные");
    }

    const rows = data.entries || [];

    renderMetrics(rows, data.source || "-");
    renderChart(rows);
    renderMedications(rows);

    reportButton.addEventListener("click", () => createReport(rows));
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
