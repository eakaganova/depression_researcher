const chartEl = document.querySelector("#chart");
const entriesEl = document.querySelector("#entries");
const medicationsEl = document.querySelector("#medications");
const reportEl = document.querySelector("#report");
const reportButton = document.querySelector("#reportButton");

function average(rows, key) {
  if (!rows.length) return "-";
  const sum = rows.reduce((total, row) => total + Number(row[key] || 0), 0);
  return (sum / rows.length).toFixed(1);
}

function renderMetrics(rows) {
  document.querySelector("#energy").textContent = average(rows, "energy");
  document.querySelector("#joy").textContent = average(rows, "joy");
  document.querySelector("#interest").textContent = average(rows, "interest");
  document.querySelector("#dayIndex").textContent = average(rows, "dayIndex");
  document.querySelector("#rowCount").textContent = `${rows.length} записей`;
  document.querySelector("#periodLabel").textContent = `${rows[0]?.date || "-"} - ${rows.at(-1)?.date || "-"}`;
}

function renderChart(rows) {
  chartEl.style.setProperty("--count", rows.length);
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

function renderEntries(rows) {
  entriesEl.innerHTML = rows
    .map(
      (row) => `
        <div class="entry">
          <strong>${row.date}</strong>
          <span>Энергия: ${row.energy}</span>
          <span>Радость: ${row.joy}</span>
          <span>Интерес: ${row.interest}</span>
          <span>Индекс: ${row.dayIndex}</span>
          <span class="pill ${row.sleepProblem ? "warning" : ""}">${row.sleepProblem ? "сон" : "ок"}</span>
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
    ["Литий", `${latest.lithiumMg} мг`]
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

async function init() {
  const response = await fetch("/api/entries");
  const rows = await response.json();

  renderMetrics(rows);
  renderChart(rows);
  renderEntries(rows);
  renderMedications(rows);

  reportButton.addEventListener("click", () => createReport(rows));
}

init();
