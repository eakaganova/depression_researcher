const smallSampleDashboard = document.querySelector("#predictorDashboard");
const SMALL_SAMPLE_MIN_TRAIN = 30;
const SMALL_SAMPLE_PRIOR_SD = 0.75;

const smallSampleFactors = [
  binarySmallFactor("sleepProblem", "Проблемы со сном", (row) => booleanSmall(row.sleepProblem)),
  binarySmallFactor("officeTrip", "Поездка в офис", (row) => booleanSmall(row.officeTrip)),
  binarySmallFactor("offlineMeeting", "Офлайн-встреча", (row) => meetingSmall(row.meetings).offline),
  binarySmallFactor("callMeeting", "Созвон", (row) => meetingSmall(row.meetings).call),
  binarySmallFactor("importantEvent", "Важное событие", (row) => textSmall(row.importantEvent)),
  binarySmallFactor("headache", "Головная боль / мигрень", (row) => {
    const value = numberSmall(row.headache);
    return Number.isFinite(value) ? Number(value > 0) : null;
  }),
  binarySmallFactor("weekend", "Выходной день", (row) => {
    const day = new Date(`${row.date}T00:00:00Z`).getUTCDay();
    return Number(day === 0 || day === 6);
  }),
  binarySmallFactor("menstrual", "Менструальная фаза", (row) => phaseSmall(row, "menstrual")),
  binarySmallFactor("ovulation", "Овуляторная фаза", (row) => phaseSmall(row, "ovulation")),
  binarySmallFactor("luteal", "Лютеиновая фаза", (row) => phaseSmall(row, "luteal")),
  changeSmallFactor("lithiumChange", "Изменение дозы лития", ["lithiumMg"]),
  changeSmallFactor("psychMedicationChange", "Изменение психотропных препаратов", ["zoloft", "fluoxetine", "zilaxera", "tritticoAtarax"]),
  changeSmallFactor("euthyroxChange", "Изменение дозы Эутирокса", ["euthyroxMg"])
];

function binarySmallFactor(key, label, exposure) { return { key, label, exposure }; }
function changeSmallFactor(key, label, medicationKeys) {
  return { key, label, exposure: (row, previous) => medicationChangeSmall(row, previous, medicationKeys) };
}

function numberSmall(value) {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).trim().replace(",", ".").match(/^-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}
function booleanSmall(value) { return value === true ? 1 : value === false ? 0 : null; }
function missingSmall(text) { return ["нд", "н/д", "нет данных", "n/a", "na", "-", "—"].includes(text); }
function negativeSmall(text) { return ["нет", "no", "false", "0"].includes(text); }
function textSmall(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || missingSmall(text)) return null;
  return negativeSmall(text) ? 0 : 1;
}
function meetingSmall(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || missingSmall(text)) return { offline: null, call: null };
  if (negativeSmall(text)) return { offline: 0, call: 0 };
  return { offline: /офлайн|личн|встреч/.test(text) ? 1 : 0, call: /созвон|онлайн|звон/.test(text) ? 1 : 0 };
}
function phaseSmall(row, phase) { return row.cycle?.phase ? Number(row.cycle.phase === phase) : null; }
function medicationChangeSmall(row, previous, keys) {
  if (!previous) return null;
  let comparable = false;
  let changed = false;
  keys.forEach((key) => {
    const before = numberSmall(previous.medications?.[key]);
    const after = numberSmall(row.medications?.[key]);
    if (Number.isFinite(before) && Number.isFinite(after)) {
      comparable = true;
      if (before !== after) changed = true;
    }
  });
  return comparable ? Number(changed) : null;
}
function meanSmall(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}
function addDaysSmall(date, days) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
function baselineFeaturesSmall(rows, index) {
  const recent = [];
  for (let cursor = Math.max(0, index - 2); cursor <= index; cursor += 1) {
    if (cursor > Math.max(0, index - 2) && rows[cursor].date !== addDaysSmall(rows[cursor - 1].date, 1)) recent.length = 0;
    const energy = numberSmall(rows[cursor].energy);
    if (Number.isFinite(energy)) recent.push(energy);
  }
  const current = numberSmall(rows[index].energy);
  return [1, current, meanSmall(recent) ?? current, recent.length > 1 ? recent.at(-1) - recent[0] : 0];
}
function buildSmallObservations(entries, horizon) {
  const rows = [...entries].filter((row) => row?.date && Number.isFinite(numberSmall(row.energy)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const byDate = new Map(rows.map((row, index) => [row.date, { row, index }]));
  const observations = [];
  rows.forEach((row, index) => {
    const future = byDate.get(addDaysSmall(row.date, horizon));
    if (!future) return;
    observations.push({ row, previous: rows[index - 1] || null, features: baselineFeaturesSmall(rows, index), actual: numberSmall(future.row.energy), currentEnergy: numberSmall(row.energy) });
  });
  return { rows, observations };
}
function solveSmall(matrix, vector) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column] || 1e-9;
    for (let cell = column; cell <= size; cell += 1) augmented[column][cell] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const multiplier = augmented[row][column];
      for (let cell = column; cell <= size; cell += 1) augmented[row][cell] -= multiplier * augmented[column][cell];
    }
  }
  return augmented.map((row) => row[size]);
}
function fitBaselineSmall(observations) {
  const dimension = 4;
  const xtx = Array.from({ length: dimension }, () => Array(dimension).fill(0));
  const xty = Array(dimension).fill(0);
  observations.forEach((observation) => observation.features.forEach((left, row) => {
    xty[row] += left * observation.actual;
    observation.features.forEach((right, column) => { xtx[row][column] += left * right; });
  }));
  for (let index = 1; index < dimension; index += 1) xtx[index][index] += 5;
  return solveSmall(xtx, xty);
}
function dotSmall(left, right) { return left.reduce((sum, value, index) => sum + value * right[index], 0); }
function rollingResidualsSmall(observations) {
  const results = [];
  for (let index = SMALL_SAMPLE_MIN_TRAIN; index < observations.length; index += 1) {
    const model = fitBaselineSmall(observations.slice(0, index));
    const observation = observations[index];
    const prediction = dotSmall(observation.features, model);
    results.push({ ...observation, prediction, residual: observation.actual - prediction, naiveError: observation.actual - observation.currentEnergy });
  }
  return results;
}
function normalCdfSmall(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = sign * (1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)));
  return 0.5 * (1 + erf);
}
function shrinkSmall(values) {
  const count = values.length;
  if (count < 3) return { count, raw: null, effect: null, low: null, high: null, probabilityDrop: null };
  const raw = meanSmall(values);
  const variance = count > 1 ? values.reduce((sum, value) => sum + (value - raw) ** 2, 0) / (count - 1) : 0;
  const standardError = Math.sqrt(variance / count) || 0.01;
  const priorVariance = SMALL_SAMPLE_PRIOR_SD ** 2;
  const samplingVariance = standardError ** 2;
  const posteriorVariance = 1 / (1 / priorVariance + 1 / samplingVariance);
  const effect = raw * posteriorVariance / samplingVariance;
  const posteriorSd = Math.sqrt(posteriorVariance);
  return { count, raw, effect, low: effect - 1.645 * posteriorSd, high: effect + 1.645 * posteriorSd, probabilityDrop: normalCdfSmall((0 - effect) / posteriorSd) };
}
function factorResultsSmall(residuals) {
  return smallSampleFactors.map((factor) => {
    const values = residuals.filter((item) => factor.exposure(item.row, item.previous) === 1).map((item) => item.residual);
    return { ...factor, ...shrinkSmall(values) };
  }).filter((item) => item.count >= 3).sort((a, b) => Math.max(0, -b.effect) * b.probabilityDrop - Math.max(0, -a.effect) * a.probabilityDrop);
}
function evidenceSmall(result) {
  if (result.count < 5) return "очень мало данных";
  if (result.probabilityDrop >= 0.95 && result.effect <= -0.25) return "устойчивый сигнал";
  if (result.probabilityDrop >= 0.8 && result.effect <= -0.15) return "возможный сигнал";
  return "сигнал не подтверждён";
}
function signedSmall(value) { return Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}` : "—"; }
function percentSmall(value) { return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "—"; }
function renderSmallSample(entries, horizon = 1) {
  if (!smallSampleDashboard) return;
  const { observations } = buildSmallObservations(entries, horizon);
  if (observations.length <= SMALL_SAMPLE_MIN_TRAIN + 10) {
    smallSampleDashboard.innerHTML = `<p class="predictor-empty">Нужно больше последовательных заполненных дней. Сейчас доступно ${observations.length} пар.</p>`;
    return;
  }
  const residuals = rollingResidualsSmall(observations);
  const results = factorResultsSmall(residuals);
  const modelMae = meanSmall(residuals.map((item) => Math.abs(item.residual)));
  const naiveMae = meanSmall(residuals.map((item) => Math.abs(item.naiveError)));
  const gain = naiveMae > 0 ? (naiveMae - modelMae) / naiveMae : null;
  const strongest = results.find((item) => item.effect < 0 && item.probabilityDrop >= 0.8);
  smallSampleDashboard.innerHTML = `
    <div class="predictor-toolbar"><div><strong>Факторы отклонения от ожидаемой энергии</strong><small>Small-N модель: каждый фактор оценивается отдельно после поправки на динамику энергии</small></div><label>Горизонт<select id="smallSampleHorizon"><option value="1" ${horizon === 1 ? "selected" : ""}>завтра</option><option value="2" ${horizon === 2 ? "selected" : ""}>через 2 дня</option></select></label></div>
    <div class="predictor-summary"><article><span>Самый заметный фактор</span><strong>${strongest?.label || "не выявлен"}</strong><small>${strongest ? `${signedSmall(strongest.effect)} балла к ожидаемому уровню` : "пока нет вероятности ≥80%"}</small></article><article><span>Ошибка базового прогноза</span><strong>${modelMae.toFixed(2)}</strong><small>наивный прогноз: ${naiveMae.toFixed(2)} балла</small></article><article><span>Улучшение прогноза</span><strong>${percentSmall(gain)}</strong><small>${residuals.length} последовательных проверок</small></article></div>
    <div class="predictor-method-note">Сначала модель прогнозирует энергию только по текущему уровню, среднему и тренду за три дня. Затем для каждого фактора считается среднее отклонение от этого прогноза. Редкие эффекты стягиваются к нулю, поэтому единичные события не становятся лидерами автоматически.</div>
    <div class="predictor-ranking"><div class="predictor-ranking-head"><span>Фактор</span><span>Ожидаемое отклонение</span><span>Вероятность спада</span><span>Оценка сигнала</span></div>${results.map((result, index) => `<article class="predictor-row ${result.probabilityDrop < 0.8 ? "weak" : ""}"><div class="predictor-name"><b>${index + 1}</b><span><strong>${result.label}</strong><small>${result.count} наблюдений с фактором</small></span></div><div class="predictor-effect ${result.effect < 0 ? "risk" : "protective"}"><strong>${signedSmall(result.effect)} балла</strong><small>90% интервал: ${signedSmall(result.low)}…${signedSmall(result.high)}</small></div><div class="predictor-reliability"><strong>${percentSmall(result.probabilityDrop)}</strong><small>вероятность отрицательного отклонения</small></div><div class="predictor-reliability"><strong>${evidenceSmall(result)}</strong><small>после Bayesian shrinkage</small></div></article>`).join("")}</div>
    <p class="predictor-disclaimer">[умозаключение] Отрицательное значение означает, что после фактора энергия была ниже ожидаемой с учётом её предыдущей динамики. Это не доказывает причинность. Изменения препаратов особенно нельзя интерпретировать как лечебный эффект или вред.</p>`;
  document.querySelector("#smallSampleHorizon")?.addEventListener("change", (event) => renderSmallSample(entries, Number(event.target.value)));
}
async function initSmallSample() {
  if (!smallSampleDashboard) return;
  smallSampleDashboard.innerHTML = '<p class="predictor-empty">Считаю small-N модель…</p>';
  try {
    const response = await fetch("/api/entries");
    const data = await response.json();
    if (!response.ok) throw new Error(data.details || data.error || "Не удалось загрузить данные");
    renderSmallSample(data.entries || [], 1);
  } catch (error) {
    smallSampleDashboard.innerHTML = `<p class="predictor-empty">Ошибка расчёта: ${String(error.message || error)}</p>`;
  }
}
initSmallSample();
