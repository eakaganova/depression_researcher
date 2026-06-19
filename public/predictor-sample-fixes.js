predictorFactors.splice(0, predictorFactors.length,
  factor("sleepProblem", "Проблемы со сном"),
  factor("officeTrip", "Поездка в офис"),
  factor("importantEvent", "Важное событие"),
  factor("offlineMeeting", "Офлайн-встреча"),
  factor("callMeeting", "Созвон"),
  factor("headache", "Головная боль / мигрень"),
  factor("weekend", "Выходной день"),
  factor("menstrual", "Менструальная фаза"),
  factor("ovulation", "Овуляторная фаза"),
  factor("luteal", "Лютеиновая фаза"),
  factor("lithiumChange", "Изменение дозы лития"),
  factor("psychMedicationChange", "Изменение психотропных препаратов"),
  factor("euthyroxChange", "Изменение дозы Эутирокса")
);
allFeatureKeys.splice(0, allFeatureKeys.length, ...baselineKeys, ...predictorFactors.flatMap((item) => item.keys));

function factor(key, label) {
  return {
    key,
    label,
    keys: [key, `${key}Known`],
    exposed: (features) => features[`${key}Known`] === 1 ? features[key] === 1 : null
  };
}

function leadingNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).trim().replace(",", ".").match(/^-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function meetingTypes(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || isMissingText(text)) return { offline: null, call: null };
  if (isNegativeText(text)) return { offline: 0, call: 0 };
  return {
    offline: /офлайн|личн|встреч/.test(text) ? 1 : 0,
    call: /созвон|онлайн|звон/.test(text) ? 1 : 0
  };
}

function setKnown(features, key, value) {
  features[key] = Number.isFinite(value) ? value : 0;
  features[`${key}Known`] = Number.isFinite(value) ? 1 : 0;
}

function changedKnownMedication(current, previous, keys) {
  if (!previous) return null;
  let comparable = false;
  let changed = false;
  for (const key of keys) {
    const before = leadingNumber(previous.medications?.[key]);
    const after = leadingNumber(current.medications?.[key]);
    if (Number.isFinite(before) && Number.isFinite(after)) {
      comparable = true;
      if (before !== after) changed = true;
    }
  }
  return comparable ? Number(changed) : null;
}

function buildPredictorFeatures(rows, index) {
  const row = rows[index];
  const previous = rows[index - 1];
  const recent = rows.slice(Math.max(0, index - 2), index + 1)
    .filter((item, localIndex, items) => localIndex === 0 || addDaysIso(items[localIndex - 1].date, 1) === item.date)
    .map((item) => leadingNumber(item.energy));
  const first = recent.find(Number.isFinite);
  const last = [...recent].reverse().find(Number.isFinite);
  const meeting = meetingTypes(row.meetings);
  const weekday = new Date(`${row.date}T00:00:00Z`).getUTCDay();
  const phase = row.cycle?.phase || null;
  const features = {
    currentEnergy: leadingNumber(row.energy),
    meanEnergy3: mean(recent),
    energyTrend3: Number.isFinite(first) && Number.isFinite(last) ? last - first : 0
  };
  setKnown(features, "sleepProblem", booleanToNumber(row.sleepProblem));
  setKnown(features, "officeTrip", booleanToNumber(row.officeTrip));
  setKnown(features, "importantEvent", textFlagToNumber(row.importantEvent));
  setKnown(features, "offlineMeeting", meeting.offline);
  setKnown(features, "callMeeting", meeting.call);
  const headache = leadingNumber(row.headache);
  setKnown(features, "headache", Number.isFinite(headache) ? Number(headache > 0) : null);
  setKnown(features, "weekend", Number(weekday === 0 || weekday === 6));
  setKnown(features, "menstrual", phase ? Number(phase === "menstrual") : null);
  setKnown(features, "ovulation", phase ? Number(phase === "ovulation") : null);
  setKnown(features, "luteal", phase ? Number(phase === "luteal") : null);
  setKnown(features, "lithiumChange", changedKnownMedication(row, previous, ["lithiumMg"]));
  setKnown(features, "psychMedicationChange", changedKnownMedication(row, previous, ["zoloft", "fluoxetine", "zilaxera", "tritticoAtarax"]));
  setKnown(features, "euthyroxChange", changedKnownMedication(row, previous, ["euthyroxMg"]));
  return features;
}

function buildPredictorObservations(entries, horizon) {
  const rows = [...entries]
    .filter((row) => row?.date && Number.isFinite(leadingNumber(row.energy)))
    .sort((a, b) => rowDate(a).localeCompare(rowDate(b)));
  const byDate = new Map(rows.map((row, index) => [row.date, { row, index }]));
  const observations = [];
  rows.forEach((row, index) => {
    const target = byDate.get(addDaysIso(row.date, horizon));
    if (!target) return;
    const currentEnergy = leadingNumber(row.energy);
    const futureEnergy = leadingNumber(target.row.energy);
    observations.push({
      date: row.date,
      features: buildPredictorFeatures(rows, index),
      delta: futureEnergy - currentEnergy,
      target: Number(futureEnergy <= currentEnergy - DROP_THRESHOLD)
    });
  });
  return { rows, observations };
}

function reliabilityLabel(item) {
  if (item.exposedCount < 8 || item.controlCount < 8 || item.importance <= 0) return "низкая";
  if (item.exposedCount >= 18 && item.controlCount >= 18 && item.importance >= 0.005 && item.ciExcludesZero) return "выше средней";
  return "средняя";
}

function renderPredictorDashboard(entries, horizon = 1) {
  if (!predictorDashboardEl) return;
  const { rows, observations } = buildPredictorObservations(entries, horizon);
  if (observations.length < 45) {
    predictorDashboardEl.innerHTML = `<p class="predictor-empty">Для модели нужно минимум 45 заполненных последовательных пар дней. Сейчас: ${observations.length}.</p>`;
    return;
  }
  const cv = crossValidatePredictors(observations);
  if (!cv.actual.length) {
    predictorDashboardEl.innerHTML = '<p class="predictor-empty">Недостаточно спадов и дней без спада для временной проверки модели.</p>';
    return;
  }
  const finalModel = fitLogistic(observations, allFeatureKeys);
  const latestRisk = predictLogistic(finalModel, [{ features: buildPredictorFeatures(rows, rows.length - 1), target: 0 }])[0];
  const prevalence = mean(observations.map((item) => item.target));
  const ranking = predictorFactors.map((item) => {
    const effect = blockBootstrapEffect(observations, item, 500);
    return {
      ...item,
      ...effect,
      importance: cv.importance[item.key] || 0,
      ciExcludesZero: Number.isFinite(effect.low) && Number.isFinite(effect.high) && (effect.low > 0 || effect.high < 0)
    };
  }).filter((item) => item.exposedCount >= 5 && item.controlCount >= 5)
    .sort((a, b) => b.importance - a.importance);
  const maximum = Math.max(...ranking.map((item) => Math.max(0, item.importance)), 0.0001);
  const brierGain = cv.baselineBrier > 0 ? (cv.baselineBrier - cv.fullBrier) / cv.baselineBrier : null;
  const modelAddsValue = Number.isFinite(brierGain) && brierGain > 0 && cv.fullAuc >= 0.55;
  const warning = modelAddsValue
    ? "Полная модель улучшает прогноз относительно одной только динамики энергии."
    : "Факторы пока не улучшают прогноз относительно базовой динамики энергии. Рейтинг ниже исследовательский, а не рабочий прогноз.";
  predictorDashboardEl.innerHTML = `
    <div class="predictor-toolbar"><div><strong>Предикторы спада энергии</strong><small>Спад: −${DROP_THRESHOLD}+ балла; пустые будущие строки исключены</small></div><label>Горизонт<select id="predictorHorizon"><option value="1" ${horizon === 1 ? "selected" : ""}>завтра</option><option value="2" ${horizon === 2 ? "selected" : ""}>через 2 дня</option></select></label></div>
    <div class="predictor-summary">
      <article><span>Расчётный риск после последней записи</span><strong>${modelAddsValue ? predictorPercent(latestRisk) : "не подтверждён"}</strong><small>обычная частота спадов ${predictorPercent(prevalence)}</small></article>
      <article><span>AUC полной модели</span><strong>${predictorMetric(cv.fullAuc, 2)}</strong><small>базовая модель ${predictorMetric(cv.baselineAuc, 2)}</small></article>
      <article><span>Изменение Brier score</span><strong>${predictorPercent(brierGain)}</strong><small>${cv.actual.length} прогнозов в ${cv.folds} временных окнах</small></article>
    </div>
    <div class="predictor-method-note"><strong>${warning}</strong><br>«нд» не считается отсутствием фактора. Офлайн-встречи и созвоны анализируются раздельно. Рейтинг учитывает пользу сверх текущей энергии и её трёхдневного тренда.</div>
    <div class="predictor-ranking"><div class="predictor-ranking-head"><span>Фактор</span><span>Прогностическая важность</span><span>Изменение энергии</span><span>Надёжность</span></div>
      ${ranking.map((item, index) => `<article class="predictor-row ${item.importance <= 0 ? "weak" : ""}"><div class="predictor-name"><b>${index + 1}</b><span><strong>${item.label}</strong><small>с фактором ${item.exposedCount}; без него ${item.controlCount}</small></span></div><div class="predictor-importance"><span style="--importance:${Math.max(0, item.importance) / maximum}"></span><strong>${predictorMetric(item.importance)}</strong></div><div class="predictor-effect ${item.effect < 0 ? "risk" : "protective"}"><strong>${predictorSigned(item.effect)} балла</strong><small>95% интервал: ${predictorSigned(item.low)}…${predictorSigned(item.high)}</small></div><div class="predictor-reliability"><strong>${reliabilityLabel(item)}</strong><small>${item.ciExcludesZero ? "интервал не включает 0" : "эффект пока неустойчив"}</small></div></article>`).join("") || '<p class="predictor-empty">Факторы заполнены слишком редко.</p>'}
    </div>
    <p class="predictor-disclaimer">[умозаключение] Модель оценивает прогностическую связь, а не причинное или лечебное влияние. Препараты особенно важно трактовать осторожно: изменение дозы обычно связано с состоянием и назначением врача.</p>`;
  document.querySelector("#predictorHorizon")?.addEventListener("change", (event) => renderPredictorDashboard(entries, Number(event.target.value)));
}

initPredictorDashboard();
