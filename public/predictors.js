const predictorDashboardEl = document.querySelector("#predictorDashboard");

const predictorFactors = [
  { key: "sleepProblem", label: "Проблемы со сном", keys: ["sleepProblem"], exposed: (x) => x.sleepProblem === 1 },
  { key: "officeTrip", label: "Поездка в офис", keys: ["officeTrip"], exposed: (x) => x.officeTrip === 1 },
  { key: "meetings", label: "Встречи", keys: ["meetings"], exposed: (x) => x.meetings === 1 },
  { key: "importantEvent", label: "Важное событие", keys: ["importantEvent"], exposed: (x) => x.importantEvent === 1 },
  { key: "headache", label: "Головная боль / мигрень", keys: ["headache"], exposed: (x) => x.headache > 0 },
  { key: "menstrual", label: "Менструальная фаза", keys: ["menstrual"], exposed: (x) => x.menstrual === 1 },
  { key: "ovulation", label: "Овуляторная фаза", keys: ["ovulation"], exposed: (x) => x.ovulation === 1 },
  { key: "luteal", label: "Лютеиновая фаза", keys: ["luteal"], exposed: (x) => x.luteal === 1 },
  { key: "lithiumChange", label: "Изменение дозы лития", keys: ["lithiumChange"], exposed: (x) => x.lithiumChange === 1 },
  { key: "psychMedicationChange", label: "Изменение психотропных препаратов", keys: ["psychMedicationChange"], exposed: (x) => x.psychMedicationChange === 1 },
  { key: "euthyroxChange", label: "Изменение дозы Эутирокса", keys: ["euthyroxChange"], exposed: (x) => x.euthyroxChange === 1 }
];

const baselineKeys = ["currentEnergy", "meanEnergy3", "energyTrend3"];
const allFeatureKeys = [...baselineKeys, ...predictorFactors.flatMap((factor) => factor.keys)];
const DROP_THRESHOLD = 1;

function predictorNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function predictorBoolean(value) {
  if (value === true) return 1;
  if (value === false) return 0;
  return null;
}

function predictorTextFlag(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || ["нд", "н/д", "нет данных", "n/a", "na", "-", "—"].includes(text)) return null;
  return ["нет", "no", "false", "0"].includes(text) ? 0 : 1;
}

function predictorDaysBetween(from, to) {
  return Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000);
}

function medicationValue(row, key) {
  return predictorNumber(row?.medications?.[key]);
}

function changedMedication(current, previous, keys) {
  if (!previous) return 0;
  return keys.some((key) => {
    const before = medicationValue(previous, key);
    const after = medicationValue(current, key);
    return Number.isFinite(before) && Number.isFinite(after) && before !== after;
  }) ? 1 : 0;
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function buildPredictorFeatures(rows, index) {
  const row = rows[index];
  const previous = rows[index - 1];
  const recentEnergy = rows.slice(Math.max(0, index - 2), index + 1).map((item) => predictorNumber(item.energy));
  const firstRecent = recentEnergy.find(Number.isFinite);
  const lastRecent = [...recentEnergy].reverse().find(Number.isFinite);
  const phase = row.cycle?.phase || null;

  return {
    currentEnergy: predictorNumber(row.energy),
    meanEnergy3: mean(recentEnergy),
    energyTrend3: Number.isFinite(firstRecent) && Number.isFinite(lastRecent) ? lastRecent - firstRecent : null,
    sleepProblem: predictorBoolean(row.sleepProblem),
    officeTrip: predictorBoolean(row.officeTrip),
    meetings: predictorTextFlag(row.meetings),
    importantEvent: predictorTextFlag(row.importantEvent),
    headache: predictorNumber(row.headache),
    menstrual: phase === "menstrual" ? 1 : 0,
    ovulation: phase === "ovulation" ? 1 : 0,
    luteal: phase === "luteal" ? 1 : 0,
    lithiumChange: changedMedication(row, previous, ["lithiumMg"]),
    psychMedicationChange: changedMedication(row, previous, ["zoloft", "fluoxetine", "zilaxera", "tritticoAtarax"]),
    euthyroxChange: changedMedication(row, previous, ["euthyroxMg"])
  };
}

function buildPredictorObservations(entries, horizon) {
  const rows = [...entries]
    .filter((row) => row?.date)
    .sort((a, b) => rowDate(a).localeCompare(rowDate(b)));
  const observations = [];

  for (let index = 2; index < rows.length; index += 1) {
    const targetIndex = index + horizon;
    const target = rows[targetIndex];
    if (!target || predictorDaysBetween(rows[index].date, target.date) !== horizon) continue;

    const currentEnergy = predictorNumber(rows[index].energy);
    const futureEnergy = predictorNumber(target.energy);
    if (!Number.isFinite(currentEnergy) || !Number.isFinite(futureEnergy)) continue;

    const features = buildPredictorFeatures(rows, index);
    observations.push({
      date: rows[index].date,
      features,
      delta: futureEnergy - currentEnergy,
      target: futureEnergy <= currentEnergy - DROP_THRESHOLD ? 1 : 0
    });
  }

  return { rows, observations };
}

function rowDate(row) {
  return String(row?.date || "");
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function prepareMatrix(observations, keys, fitted = null) {
  const imputes = fitted?.imputes || Object.fromEntries(keys.map((key) => [key, median(observations.map((item) => item.features[key]))]));
  const raw = observations.map((item) => keys.map((key) => Number.isFinite(item.features[key]) ? item.features[key] : imputes[key]));
  const means = fitted?.means || keys.map((_, column) => mean(raw.map((row) => row[column])) || 0);
  const scales = fitted?.scales || keys.map((_, column) => {
    const variance = mean(raw.map((row) => (row[column] - means[column]) ** 2)) || 0;
    return Math.sqrt(variance) || 1;
  });
  return {
    matrix: raw.map((row) => row.map((value, column) => (value - means[column]) / scales[column])),
    imputes,
    means,
    scales
  };
}

function sigmoid(value) {
  const clipped = Math.max(-25, Math.min(25, value));
  return 1 / (1 + Math.exp(-clipped));
}

function fitLogistic(observations, keys) {
  const prepared = prepareMatrix(observations, keys);
  const weights = Array(keys.length + 1).fill(0);
  const learningRate = 0.08;
  const ridge = 0.35;

  for (let iteration = 0; iteration < 700; iteration += 1) {
    const gradient = Array(weights.length).fill(0);
    prepared.matrix.forEach((row, rowIndex) => {
      const prediction = sigmoid(weights[0] + row.reduce((sum, value, column) => sum + value * weights[column + 1], 0));
      const error = prediction - observations[rowIndex].target;
      gradient[0] += error;
      row.forEach((value, column) => { gradient[column + 1] += error * value; });
    });
    weights[0] -= learningRate * gradient[0] / observations.length;
    for (let index = 1; index < weights.length; index += 1) {
      weights[index] -= learningRate * ((gradient[index] / observations.length) + ridge * weights[index] / observations.length);
    }
  }

  return { keys, weights, ...prepared };
}

function predictLogistic(model, observations, override = null) {
  const prepared = prepareMatrix(observations, model.keys, model);
  return prepared.matrix.map((row, rowIndex) => {
    const source = override ? override(row, rowIndex, prepared.matrix) : row;
    const linear = model.weights[0] + source.reduce((sum, value, column) => sum + value * model.weights[column + 1], 0);
    return sigmoid(linear);
  });
}

function brierScore(actual, predicted) {
  if (!actual.length) return null;
  return mean(actual.map((value, index) => (predicted[index] - value) ** 2));
}

function aucScore(actual, predicted) {
  const positives = actual.map((value, index) => value === 1 ? predicted[index] : null).filter(Number.isFinite);
  const negatives = actual.map((value, index) => value === 0 ? predicted[index] : null).filter(Number.isFinite);
  if (!positives.length || !negatives.length) return null;
  let wins = 0;
  positives.forEach((positive) => negatives.forEach((negative) => {
    wins += positive > negative ? 1 : positive === negative ? 0.5 : 0;
  }));
  return wins / (positives.length * negatives.length);
}

function buildTimeFolds(observations) {
  if (observations.length < 30) return [];
  const minimumTrain = Math.max(24, Math.floor(observations.length * 0.45));
  const remaining = observations.length - minimumTrain;
  const blockSize = Math.max(6, Math.floor(remaining / 4));
  const folds = [];
  for (let start = minimumTrain; start < observations.length; start += blockSize) {
    const test = observations.slice(start, Math.min(observations.length, start + blockSize));
    if (test.length >= 3) folds.push({ train: observations.slice(0, start), test });
  }
  return folds;
}

function rotatedOverride(model, factor, test) {
  const indexes = factor.keys.map((key) => model.keys.indexOf(key)).filter((index) => index >= 0);
  return (row, rowIndex, matrix) => {
    if (!indexes.length || matrix.length < 2) return row;
    const donor = matrix[(rowIndex + 1) % matrix.length];
    const copy = [...row];
    indexes.forEach((index) => { copy[index] = donor[index]; });
    return copy;
  };
}

function crossValidatePredictors(observations) {
  const folds = buildTimeFolds(observations);
  const actual = [];
  const fullPredictions = [];
  const baselinePredictions = [];
  const permuted = Object.fromEntries(predictorFactors.map((factor) => [factor.key, []]));

  folds.forEach(({ train, test }) => {
    if (new Set(train.map((item) => item.target)).size < 2) return;
    const fullModel = fitLogistic(train, allFeatureKeys);
    const baselineModel = fitLogistic(train, baselineKeys);
    actual.push(...test.map((item) => item.target));
    fullPredictions.push(...predictLogistic(fullModel, test));
    baselinePredictions.push(...predictLogistic(baselineModel, test));
    predictorFactors.forEach((factor) => {
      permuted[factor.key].push(...predictLogistic(fullModel, test, rotatedOverride(fullModel, factor, test)));
    });
  });

  const fullBrier = brierScore(actual, fullPredictions);
  const baselineBrier = brierScore(actual, baselinePredictions);
  return {
    folds: folds.length,
    actual,
    fullPredictions,
    baselinePredictions,
    fullBrier,
    baselineBrier,
    fullAuc: aucScore(actual, fullPredictions),
    baselineAuc: aucScore(actual, baselinePredictions),
    importance: Object.fromEntries(predictorFactors.map((factor) => [
      factor.key,
      fullBrier === null ? null : (brierScore(actual, permuted[factor.key]) - fullBrier)
    ]))
  };
}

function blockBootstrapEffect(observations, factor, iterations = 300) {
  const eligible = observations.filter((item) => factor.exposed(item.features) !== null);
  const exposedCount = eligible.filter((item) => factor.exposed(item.features)).length;
  const controlCount = eligible.length - exposedCount;
  if (exposedCount < 4 || controlCount < 4) return { effect: null, low: null, high: null, exposedCount, controlCount };

  const calculate = (sample) => {
    const exposed = sample.filter((item) => factor.exposed(item.features)).map((item) => item.delta);
    const control = sample.filter((item) => !factor.exposed(item.features)).map((item) => item.delta);
    return exposed.length && control.length ? mean(exposed) - mean(control) : null;
  };
  const effect = calculate(eligible);
  const estimates = [];
  const blockLength = Math.min(7, Math.max(2, Math.floor(Math.sqrt(eligible.length))));
  let seed = 1729 + factor.key.length;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sample = [];
    while (sample.length < eligible.length) {
      const start = Math.floor(random() * Math.max(1, eligible.length - blockLength + 1));
      sample.push(...eligible.slice(start, start + blockLength));
    }
    const estimate = calculate(sample.slice(0, eligible.length));
    if (Number.isFinite(estimate)) estimates.push(estimate);
  }
  estimates.sort((a, b) => a - b);
  return {
    effect,
    low: estimates[Math.floor(estimates.length * 0.025)] ?? null,
    high: estimates[Math.floor(estimates.length * 0.975)] ?? null,
    exposedCount,
    controlCount
  };
}

function modelCoefficient(model, factor) {
  return factor.keys.reduce((sum, key) => {
    const index = model.keys.indexOf(key);
    return index >= 0 ? sum + model.weights[index + 1] : sum;
  }, 0);
}

function predictorPercent(value, digits = 0) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "—";
}

function predictorSigned(value, digits = 1) {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function predictorMetric(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function reliabilityLabel(item) {
  if (item.exposedCount < 8 || item.importance <= 0) return "низкая";
  if (item.exposedCount >= 18 && item.importance >= 0.005 && item.ciExcludesZero) return "выше средней";
  return "средняя";
}

function renderPredictorDashboard(entries, horizon = 1) {
  if (!predictorDashboardEl) return;
  const { rows, observations } = buildPredictorObservations(entries, horizon);
  if (observations.length < 30) {
    predictorDashboardEl.innerHTML = `<p class="predictor-empty">Для прогностической модели нужно хотя бы 30 последовательных пар дней. Сейчас доступно: ${observations.length}.</p>`;
    return;
  }

  const cv = crossValidatePredictors(observations);
  if (!cv.actual.length) {
    predictorDashboardEl.innerHTML = '<p class="predictor-empty">Пока недостаточно спадов и дней без спада для проверки модели на будущих периодах.</p>';
    return;
  }

  const finalModel = fitLogistic(observations, allFeatureKeys);
  const latestFeatures = buildPredictorFeatures(rows, rows.length - 1);
  const latestRisk = predictLogistic(finalModel, [{ features: latestFeatures, target: 0 }])[0];
  const prevalence = mean(observations.map((item) => item.target));
  const ranking = predictorFactors.map((factor) => {
    const effect = blockBootstrapEffect(observations, factor);
    const importance = cv.importance[factor.key] || 0;
    return {
      ...factor,
      ...effect,
      importance,
      coefficient: modelCoefficient(finalModel, factor),
      ciExcludesZero: Number.isFinite(effect.low) && Number.isFinite(effect.high) && (effect.low > 0 || effect.high < 0)
    };
  })
    .filter((item) => item.exposedCount >= 4 && item.controlCount >= 4)
    .sort((a, b) => b.importance - a.importance);

  const maximumImportance = Math.max(...ranking.map((item) => Math.max(0, item.importance)), 0.0001);
  const brierGain = Number.isFinite(cv.baselineBrier) && cv.baselineBrier > 0
    ? (cv.baselineBrier - cv.fullBrier) / cv.baselineBrier
    : null;

  predictorDashboardEl.innerHTML = `
    <div class="predictor-toolbar">
      <div>
        <strong>Предикторы спада энергии</strong>
        <small>Спад: −${DROP_THRESHOLD}+ балла; проверка только на последующих днях</small>
      </div>
      <label>Горизонт
        <select id="predictorHorizon">
          <option value="1" ${horizon === 1 ? "selected" : ""}>завтра</option>
          <option value="2" ${horizon === 2 ? "selected" : ""}>через 2 дня</option>
        </select>
      </label>
    </div>
    <div class="predictor-summary">
      <article><span>Расчётный риск сейчас</span><strong>${predictorPercent(latestRisk)}</strong><small>средняя частота спадов ${predictorPercent(prevalence)}</small></article>
      <article><span>AUC полной модели</span><strong>${predictorMetric(cv.fullAuc, 2)}</strong><small>базовая модель ${predictorMetric(cv.baselineAuc, 2)}</small></article>
      <article><span>Улучшение Brier score</span><strong>${predictorPercent(brierGain)}</strong><small>${cv.actual.length} прогнозов в ${cv.folds} временных окнах</small></article>
    </div>
    <div class="predictor-method-note">
      Базовая модель учитывает текущую энергию, среднее и тренд за 3 дня. Важность показывает, насколько ухудшается прогноз на будущих данных при перемешивании одного фактора. Отрицательная важность означает, что подтверждённой прогностической пользы пока нет.
    </div>
    <div class="predictor-ranking">
      <div class="predictor-ranking-head"><span>Фактор</span><span>Прогностическая важность</span><span>Наблюдаемый эффект</span><span>Надёжность</span></div>
      ${ranking.map((item, index) => `
        <article class="predictor-row ${item.importance <= 0 ? "weak" : ""}">
          <div class="predictor-name"><b>${index + 1}</b><span><strong>${item.label}</strong><small>дней с фактором: ${item.exposedCount}</small></span></div>
          <div class="predictor-importance"><span style="--importance:${Math.max(0, item.importance) / maximumImportance}"></span><strong>${predictorMetric(item.importance, 3)}</strong></div>
          <div class="predictor-effect ${item.effect < 0 ? "protective" : "risk"}"><strong>${predictorSigned(item.effect)} балла</strong><small>95% интервал: ${predictorSigned(item.low)}…${predictorSigned(item.high)}</small></div>
          <div class="predictor-reliability"><strong>${reliabilityLabel(item)}</strong><small>${item.ciExcludesZero ? "интервал не включает 0" : "эффект пока неустойчив"}</small></div>
        </article>
      `).join("") || '<p class="predictor-empty">Факторы пока заполнены слишком редко для ранжирования.</p>'}
    </div>
    <p class="predictor-disclaimer">[умозаключение] Это персональная прогностическая модель, а не доказательство причинности и не медицинская рекомендация. При малом числе наблюдений оценки могут заметно меняться после добавления новых дней.</p>
  `;

  document.querySelector("#predictorHorizon")?.addEventListener("change", (event) => {
    renderPredictorDashboard(entries, Number(event.target.value));
  });
}

async function initPredictorDashboard() {
  if (!predictorDashboardEl) return;
  predictorDashboardEl.innerHTML = '<p class="predictor-empty">Считаю прогностическую модель…</p>';
  try {
    const response = await fetch("/api/entries");
    const data = await response.json();
    if (!response.ok) throw new Error(data.details || data.error || "Не удалось загрузить данные");
    renderPredictorDashboard(data.entries || [], 1);
  } catch (error) {
    predictorDashboardEl.innerHTML = `<p class="predictor-empty">Не удалось рассчитать модель: ${String(error.message || error)}</p>`;
  }
}

initPredictorDashboard();
