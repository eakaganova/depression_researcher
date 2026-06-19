const treatmentChangesEl = document.querySelector("#treatmentChanges");
const treatmentPeriodEl = document.querySelector("#treatmentPeriod");

const treatmentMedicationFields = [
  ["zoloft", "Золофт", "мг"],
  ["fluoxetine", "Флуоксетин", "мг"],
  ["zilaxera", "Зилаксера", "мг"],
  ["tritticoAtarax", "Триттико / Атаракс", ""],
  ["lithiumMg", "Литий", "мг"],
  ["euthyroxMg", "Эутирокс", "мкг"]
];

function treatmentNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).replace(",", ".").match(/^-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function treatmentDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function treatmentValue(value, unit) {
  if (!Number.isFinite(value)) return "нет данных";
  return `${String(value).replace(".", ",")}${unit ? ` ${unit}` : ""}`;
}

function buildTreatmentChanges(rows) {
  const filledRows = [...rows]
    .filter((row) => row?.date && row.medications)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const changes = [];
  let previous = null;

  filledRows.forEach((row) => {
    if (!previous) {
      previous = row;
      return;
    }
    treatmentMedicationFields.forEach(([key, label, unit]) => {
      const before = treatmentNumber(previous.medications?.[key]);
      const after = treatmentNumber(row.medications?.[key]);
      if (Number.isFinite(before) && Number.isFinite(after) && before !== after) {
        changes.push({ date: row.date, label, before, after, unit });
      }
    });
    previous = row;
  });
  return changes;
}

function renderTreatmentSummary(rows) {
  if (!treatmentChangesEl) return;
  const filledRows = rows.filter((row) => row?.date && Number.isFinite(treatmentNumber(row.energy)));
  const lastDate = filledRows.at(-1)?.date;
  if (treatmentPeriodEl) treatmentPeriodEl.textContent = lastDate ? `по записи от ${treatmentDate(lastDate)}` : "—";

  const changes = buildTreatmentChanges(rows).slice(-8).reverse();
  if (!changes.length) {
    treatmentChangesEl.innerHTML = '<p class="empty-state">Изменений дозировок в загруженном периоде не найдено.</p>';
    return;
  }
  treatmentChangesEl.innerHTML = changes.map((change) => `
    <article class="treatment-change">
      <time>${treatmentDate(change.date)}</time>
      <strong>${change.label}</strong>
      <span>${treatmentValue(change.before, change.unit)} → ${treatmentValue(change.after, change.unit)}</span>
    </article>
  `).join("");
}

async function initTreatmentSummary() {
  if (!treatmentChangesEl) return;
  treatmentChangesEl.innerHTML = '<p class="empty-state">Загружаю изменения лечения…</p>';
  try {
    const response = await fetch("/api/entries");
    const data = await response.json();
    if (!response.ok) throw new Error(data.details || data.error || "Не удалось загрузить данные");
    renderTreatmentSummary(data.entries || []);
  } catch (error) {
    treatmentChangesEl.innerHTML = `<p class="empty-state">Не удалось загрузить изменения лечения: ${String(error.message || error)}</p>`;
  }
}

initTreatmentSummary();
