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
const monthlyChartEl = document.querySelector("#monthlyChart");
const weeklyChartEl = document.querySelector("#weeklyChart");
const weeklyExplanationEl = document.querySelector("#weeklyExplanation");
const energyMedicationInsightEl = document.querySelector("#energyMedicationInsight");
const sleepInsightEl = document.querySelector("#sleepInsight");
const correlationSelectEl = document.querySelector("#correlationSelect");
const customCorrelationResultEl = document.querySelector("#customCorrelationResult");

const series = [
  { key: "energy", label: "Энергия", color: "#c94f7c" },
  { key: "joy", label: "Радость", color: "#e58eaa" },
  { key: "interest", label: "Интерес", color: "#8f5f88" }
];
const chartMinValue = 0;
const chartMaxValue = 10;
const medicationFields = [
  { key: "fluoxetine", label: "Флуоксетин" },
  { key: "euthyroxMg", label: "Эутирокс" },
  { key: "zoloft", label: "Золофт" },
  { key: "zilaxera", label: "Зилаксера" },
  { key: "tritticoAtarax", label: "Триттико / Атаракс" },
  { key: "lithiumMg", label: "Литий" }
];

const customCorrelationFields = [
  { key: "joy", label: "Радость", getValue: (row) => row.joy },
  { key: "interest", label: "Интерес", getValue: (row) => row.interest },
  { key: "dayIndex", label: "Индекс дня", getValue: (row) => row.dayIndex },
  { key: "sleepProblem", label: "Проблемы со сном ночью", getValue: (row) => (row.sleepProblem ? 1 : 0), binary: true },
  { key: "importantEvent", label: "Что-то важное", getValue: (row) => hasFilledText(row.importantEvent) ? 1 : 0, binary: true },
  { key: "officeTrip", label: "Поездка в офис", getValue: (row) => (row.officeTrip ? 1 : 0), binary: true },
  { key: "meetings", label: "Встречи", getValue: (row) => hasFilledText(row.meetings) ? 1 : 0, binary: true },
  { key: "cycleDay", label: "День цикла", getValue: (row) => row.cycleDay },
  { key: "headache", label: "Головная боль / мигрень", getValue: (row) => row.headache },
  { key: "zoloft", label: "Золофт", getValue: (row) => row.medications?.zoloft },
  { key: "fluoxetine", label: "Флуоксетин", getValue: (row) => row.medications?.fluoxetine },
  { key: "zilaxera", label: "Зилаксера", getValue: (row) => row.medications?.zilaxera },
  { key: "tritticoAtarax", label: "Триттико / Атаракс", getValue: (row) => row.medications?.tritticoAtarax },
  { key: "lithiumMg", label: "Литий", getValue: (row) => row.medications?.lithiumMg },
  { key: "euthyroxMg", label: "Эутирокс", getValue: (row) => row.medications?.euthyroxMg }
];

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

function hasFilledText(value) {
  const text = String(value || "").trim().toLowerCase();
  return Boolean(text && text !== "нет" && text !== "нд" && text !== "РЅРµС‚");
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
    ["Флуоксетин", latest.fluoxetine],
    ["Зилаксера", latest.zilaxera],
    ["Триттико / Атаракс", latest.tritticoAtarax],
    ["Литий", latest.lithiumMg === null ? null : `${latest.lithiumMg} мг`],
    ["Эутирокс", latest.euthyroxMg === null ? null : `${latest.euthyroxMg} мг`]
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
    fluoxetine: null,
    zilaxera: null,
    tritticoAtarax: null,
    lithiumMg: null,
    euthyroxMg: null
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

  comparisonTitleEl.textContent = "Что изменилось в состоянии с января?";
  comparisonPeriodEl.textContent = `Январь / ${currentMonthName}: ${januaryRows.length} / ${currentRows.length} дн.`;

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

function renderMonthlyAverages(rows) {
  const plotHeight = 180;
  const byMonth = new Map();
  rows.forEach((row) => {
    if (!row.date || !Number.isFinite(row.energy)) return;
    const monthKey = row.date.slice(0, 7);
    if (!byMonth.has(monthKey)) byMonth.set(monthKey, []);
    byMonth.get(monthKey).push(row.energy);
  });

  const monthly = Array.from(byMonth.entries()).map(([monthKey, values]) => ({
    monthKey,
    label: getShortMonthLabel(monthKey),
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    days: values.length
  }));

  if (!monthly.length) {
    monthlyChartEl.textContent = "Нет данных об энергии для помесячного графика.";
    return;
  }

  const trendValues = calculateTrendValues(monthly.map((month) => month.average));

  monthlyChartEl.innerHTML = `
    <div class="monthly-axis" aria-hidden="true">
      ${[10, 8, 6, 4, 2, 0].map((value) => `<span style="--axis-position: ${value * 10}%">${value}</span>`).join("")}
    </div>
    <div class="monthly-target" aria-hidden="true">
      <span>желаемый диапазон 5-6</span>
    </div>
    <div class="monthly-bars">
      <svg class="monthly-trend" viewBox="0 0 ${monthly.length * 76} ${plotHeight}" preserveAspectRatio="none" aria-label="Линия тренда">
        <polyline points="${trendValues.map((value, index) => `${index * 76 + 38},${plotHeight - value * (plotHeight / 10)}`).join(" ")}"></polyline>
        ${trendValues.map((value, index) => `<circle cx="${index * 76 + 38}" cy="${plotHeight - value * (plotHeight / 10)}" r="3"></circle>`).join("")}
      </svg>
      ${monthly.map((month) => `
        <div class="monthly-column" title="${month.label}: ${month.average.toFixed(1)} (${month.days} дн.)">
          <div class="monthly-bar ${month.average >= 5 && month.average <= 6 ? "in-target" : ""}" style="--height: ${month.average * 10}%">
            <span class="monthly-value">${month.average.toFixed(1)}</span>
          </div>
          <span class="monthly-label">${month.label}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function calculateTrendValues(values) {
  if (values.length < 2) return values;
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });
  const slope = denominator ? numerator / denominator : 0;
  const intercept = meanY - slope * meanX;
  return values.map((value, index) => Math.min(10, Math.max(0, intercept + slope * index)));
}

function renderWeeklyEnergyVariability(rows) {
  const weeks = buildWeeklyEnergyStats(rows);

  if (!weeks.length) {
    weeklyChartEl.textContent = "Нет данных об энергии по неделям.";
    weeklyExplanationEl.textContent = "";
    return;
  }

  weeklyChartEl.innerHTML = `
    <div class="weekly-axis" aria-hidden="true">
      ${[10, 8, 6, 4, 2, 0].map((value) => `<span style="--axis-position: ${value * 10}%">${value}</span>`).join("")}
    </div>
    <div class="weekly-target" aria-hidden="true"></div>
    <div class="weekly-bars">
      ${weeks.map((week) => `
        <div class="weekly-column" title="${week.label}: ${week.min.toFixed(1)}-${week.max.toFixed(1)}, среднее ${week.average.toFixed(1)}, отклонение ±${week.deviation.toFixed(1)}">
          <div class="weekly-plot">
            <div class="weekly-range" style="--low: ${week.min * 10}%; --spread: ${(week.max - week.min) * 10}%"></div>
            <span class="weekly-deviation" style="--top: ${week.max * 10}%">±${week.deviation.toFixed(1)}</span>
            <span class="weekly-mean" style="--mean: ${week.average * 10}%"></span>
          </div>
          <small>${week.shortLabel}</small>
        </div>
      `).join("")}
    </div>
    <div class="weekly-legend">
      <span><i></i>диапазон минимум-максимум</span>
      <span><em>±</em>отклонение</span>
      <span><b></b>точка среднего</span>
    </div>
  `;

  weeklyExplanationEl.innerHTML = buildWeeklyExplanation(weeks);
}

function buildWeeklyEnergyStats(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    if (!row.date || !Number.isFinite(row.energy)) return;
    const startDate = getMondayIso(row.date);
    if (!groups.has(startDate)) groups.set(startDate, []);
    groups.get(startDate).push(row);
  });

  return Array.from(groups.entries()).map(([startDate, weekRows]) => {
    const values = weekRows.map((row) => row.energy);
    const lithiumValues = weekRows.map((row) => row.medications?.lithiumMg).filter(Number.isFinite);
    const averageValue = values.reduce((sum, value) => sum + value, 0) / values.length;
    const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - averageValue) ** 2, 0) / values.length);
    const endDate = addDaysIso(startDate, 6);
    return {
      startDate,
      endDate,
      shortLabel: formatIsoShort(startDate),
      label: `${formatIsoShort(startDate)}-${formatIsoShort(endDate)}`,
      min: Math.min(...values),
      max: Math.max(...values),
      average: averageValue,
      deviation,
      days: values.length,
      lithiumAverage: lithiumValues.length
        ? lithiumValues.reduce((sum, value) => sum + value, 0) / lithiumValues.length
        : null
    };
  });
}

function buildWeeklyExplanation(weeks) {
  const completeEnough = weeks.filter((week) => week.days >= 4);
  const comparable = completeEnough.length ? completeEnough : weeks;
  const latest = weeks.at(-1);
  const basisText = completeEnough.length ? "Сравниваются недели с 4 и более записями." : "Сравнение предварительное: заполненных недель пока мало.";
  const lithiumCorrelation = calculateWeeklyLithiumVariabilityCorrelation(weeks);

  return `
    <p class="weekly-summary">${basisText}</p>
    <article class="weekly-analysis">
      <span>Последняя неделя</span>
      <strong>${latest.label}</strong>
      <p>${describeLatestWeeklyVariability(latest, comparable)}</p>
    </article>
    <article class="weekly-analysis lithium">
      <span>Колебания и литий за весь период</span>
      <p>${describeWeeklyLithiumCorrelation(lithiumCorrelation)}</p>
    </article>
  `;
}

function describeLatestWeeklyVariability(latest, comparable) {
  const sorted = [...comparable].sort((first, second) => first.deviation - second.deviation);
  const rank = sorted.findIndex((week) => week.startDate === latest.startDate);
  let comparison = "Неделя пока неполная, сравнение предварительное.";
  if (rank !== -1) {
    if (rank < sorted.length / 3) {
      comparison = "Энергия была устойчивее, чем в большинстве сравнимых недель.";
    } else if (rank >= (sorted.length * 2) / 3) {
      comparison = "Энергия колебалась сильнее, чем в большинстве сравнимых недель.";
    } else {
      comparison = "Колебания энергии находятся около обычного уровня.";
    }
  }
  return `Средняя энергия ${latest.average.toFixed(1)}, диапазон ${latest.min.toFixed(1)}-${latest.max.toFixed(1)}, отклонение ±${latest.deviation.toFixed(1)} по ${latest.days} дн. ${comparison}`;
}

function calculateWeeklyLithiumVariabilityCorrelation(weeks) {
  const comparable = weeks.filter((week) => week.days >= 4 && Number.isFinite(week.lithiumAverage));
  const pairs = comparable.map((week) => [week.deviation, week.lithiumAverage]);
  if (pairs.length < 3) return { r: null, n: pairs.length, note: "Недостаточно заполненных недель для расчета." };
  if (new Set(pairs.map((pair) => pair[1])).size < 2) {
    return { r: null, n: pairs.length, note: "Доза лития по неделям не менялась, корреляцию посчитать нельзя." };
  }

  const meanDeviation = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const meanLithium = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  let numerator = 0;
  let deviationSquares = 0;
  let lithiumSquares = 0;
  pairs.forEach(([deviation, lithium]) => {
    const deviationDelta = deviation - meanDeviation;
    const lithiumDelta = lithium - meanLithium;
    numerator += deviationDelta * lithiumDelta;
    deviationSquares += deviationDelta ** 2;
    lithiumSquares += lithiumDelta ** 2;
  });
  const denominator = Math.sqrt(deviationSquares * lithiumSquares);
  return denominator
    ? { r: numerator / denominator, n: pairs.length }
    : { r: null, n: pairs.length, note: "Недостаточно вариативности для расчета." };
}

function describeWeeklyLithiumCorrelation(result) {
  if (result.r === null) return result.note;
  const direction = result.r < 0
    ? "более высокая доза сопровождалась меньшими колебаниями"
    : "более высокая доза сопровождалась большими колебаниями";
  const strength = Math.abs(result.r) >= 0.5 ? "Заметная" : Math.abs(result.r) >= 0.3 ? "Умеренная" : "Слабая";
  return `${strength} связь: r=${result.r.toFixed(2)}, n=${result.n}; ${direction}. Это не доказывает причинный эффект.`;
}

function getMondayIso(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function addDaysIso(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatIsoShort(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return year ? `${day}.${month}` : isoDate;
}

function renderInsights(rows, today) {
  renderCustomCorrelation(rows);
  renderEnergyMedicationInsight(rows);
  renderSleepInsight(rows, today);
}

function renderCustomCorrelation(rows) {
  if (!correlationSelectEl || !customCorrelationResultEl) return;

  if (!correlationSelectEl.options.length) {
    correlationSelectEl.innerHTML = customCorrelationFields
      .map((field) => `<option value="${field.key}">${field.label}</option>`)
      .join("");
  }

  const selectedField = customCorrelationFields.find((field) => field.key === correlationSelectEl.value) || customCorrelationFields[0];
  const laggedResults = calculateLaggedCorrelations(rows, (row) => row.energy, selectedField.getValue);
  const result = laggedResults[0].result;

  customCorrelationResultEl.innerHTML = `
    <div class="correlation-score ${result.r === null ? "muted" : result.r >= 0 ? "positive" : "negative"}">${formatCorrelationScore(result)}</div>
    <p>${describeLaggedEnergySummary(selectedField.label, laggedResults)}</p>
    <small>${selectedField.binary ? "Параметр считается как да/нет." : "Параметр сравнивается с уровнем энергии."} r около 0 значит, что заметной связи не видно; знак + означает выше, знак - ниже.</small>
    <div class="lag-correlation-list">
      ${laggedResults.map((item) => renderLagCorrelationRow(item)).join("")}
    </div>
  `;
}

function calculateLaggedCorrelations(rows, getTarget, getFactor) {
  const byDate = new Map(rows.filter((row) => row.date).map((row) => [row.date, row]));
  return [0, 1, 2].map((lag) => {
    const pairs = rows
      .map((row) => {
        if (!row.date) return null;
        const targetRow = byDate.get(addDaysIso(row.date, lag));
        return targetRow ? [getTarget(targetRow), getFactor(row)] : null;
      })
      .filter(Boolean);
    return {
      lag,
      result: calculateCorrelationPairs(pairs)
    };
  });
}

function calculateCorrelationPairs(pairs) {
  const validPairs = pairs.filter(([first, second]) => Number.isFinite(first) && Number.isFinite(second));
  if (validPairs.length < 3) return { r: null, n: validPairs.length, note: "мало данных" };
  if (new Set(validPairs.map((pair) => pair[1])).size < 2) {
    return { r: null, n: validPairs.length, note: "значение не менялось" };
  }

  const meanFirst = validPairs.reduce((sum, pair) => sum + pair[0], 0) / validPairs.length;
  const meanSecond = validPairs.reduce((sum, pair) => sum + pair[1], 0) / validPairs.length;
  let numerator = 0;
  let firstSquares = 0;
  let secondSquares = 0;
  validPairs.forEach(([first, second]) => {
    const firstDelta = first - meanFirst;
    const secondDelta = second - meanSecond;
    numerator += firstDelta * secondDelta;
    firstSquares += firstDelta ** 2;
    secondSquares += secondDelta ** 2;
  });
  const denominator = Math.sqrt(firstSquares * secondSquares);
  return denominator ? { r: numerator / denominator, n: validPairs.length } : { r: null, n: validPairs.length, note: "нет вариации" };
}

function renderLagCorrelationRow({ lag, result }) {
  const label = getEnergyLagLabel(lag);
  if (result.r === null) {
    return `
      <div class="lag-correlation-row muted">
        <span>${label}</span>
        <strong>пока неясно</strong>
        <small>${result.note}, дней в расчете: ${result.n}</small>
      </div>
    `;
  }
  return `
    <div class="lag-correlation-row ${result.r < 0 ? "negative" : "positive"}">
      <span>${label}</span>
      <strong>${describeCorrelationDirection(result.r)}</strong>
      <small>${describeCorrelationStrength(result.r)} связь, r=${result.r.toFixed(2)}, дней в расчете: ${result.n}</small>
    </div>
  `;
}

function formatCorrelationScore(result) {
  if (result.r === null) return "-";
  return result.r > 0 ? `+${result.r.toFixed(2)}` : result.r.toFixed(2);
}

function describeLaggedEnergySummary(label, laggedResults) {
  const futureResults = laggedResults
    .filter((item) => item.lag > 0 && item.result.r !== null)
    .sort((first, second) => Math.abs(second.result.r) - Math.abs(first.result.r));

  if (!futureResults.length) {
    return `Для "${label}" пока не хватает данных, чтобы уверенно понять связь с энергией на следующие 1-2 дня.`;
  }

  const strongest = futureResults[0];
  if (Math.abs(strongest.result.r) < 0.3) {
    return `Для "${label}" заметной связи с энергией на следующие 1-2 дня пока не видно. Это скорее похоже на шум, чем на устойчивый след события.`;
  }

  const direction = strongest.result.r > 0 ? "выше" : "ниже";
  const lagText = strongest.lag === 1 ? "на следующий день" : "через 2 дня";
  return `Самый заметный след для "${label}" виден ${lagText}: энергия обычно ${direction}. Это подсказка для наблюдения, а не доказательство причины.`;
}

function getEnergyLagLabel(lag) {
  if (lag === 0) return "Энергия в тот же день";
  if (lag === 1) return "Энергия на следующий день";
  return "Энергия через 2 дня";
}

function describeCorrelationDirection(r) {
  if (Math.abs(r) < 0.3) return "связь слабая";
  return r > 0 ? "обычно выше" : "обычно ниже";
}

function describeCorrelationStrength(r) {
  const value = Math.abs(r);
  if (value >= 0.5) return "заметная";
  if (value >= 0.3) return "умеренная";
  return "слабая";
}

function describeCustomCorrelation(label, result) {
  const direction = result.r > 0 ? "выше" : "ниже";
  const strength = Math.abs(result.r) >= 0.5
    ? "заметная"
    : Math.abs(result.r) >= 0.3
      ? "умеренная"
      : "слабая";
  return `${strength} связь: когда "${label}" растет или встречается чаще, энергия обычно ${direction}. Это корреляция, а не доказательство причины.`;
}

function renderEnergyMedicationInsight(rows) {
  const results = medicationFields.map((medication) => ({
    ...medication,
    result: calculateCorrelation(rows, (row) => row.energy, (row) => row.medications?.[medication.key])
  }));
  const meaningful = results
    .filter((item) => item.result.r !== null && Math.abs(item.result.r) >= 0.3)
    .sort((a, b) => Math.abs(b.result.r) - Math.abs(a.result.r));

  const summary = meaningful.length
    ? `Наиболее заметная связь: ${meaningful[0].label}, r=${meaningful[0].result.r.toFixed(2)}.`
    : "Заметной корреляции энергии с дозировками не обнаружено.";

  energyMedicationInsightEl.innerHTML = `
    <p class="insight-summary">${summary}</p>
    <div class="correlation-list">
      ${results.map((item) => renderCorrelationRow(item.label, item.result)).join("")}
    </div>
    <p class="insight-note">Корреляция показывает совместное изменение, а не причину.</p>
  `;
}

function renderSleepInsight(rows, today) {
  const currentMonthKey = String(today || rows.at(-1)?.date || "").slice(0, 7);
  const monthRows = rows.filter((row) => row.date?.startsWith(currentMonthKey) && (!today || row.date <= today));
  const sleepDays = monthRows.filter((row) => row.sleepProblem).length;
  const share = monthRows.length ? Math.round((sleepDays / monthRows.length) * 100) : null;
  const results = medicationFields.map((medication) => ({
    ...medication,
    result: calculateCorrelation(rows, (row) => (row.sleepProblem ? 1 : 0), (row) => row.medications?.[medication.key])
  }));
  const meaningful = results
    .filter((item) => item.result.r !== null && Math.abs(item.result.r) >= 0.3)
    .sort((a, b) => Math.abs(b.result.r) - Math.abs(a.result.r));

  sleepInsightEl.innerHTML = `
    <div class="sleep-share">
      <strong>${share === null ? "-" : `${share}%`}</strong>
      <span>дней с проблемами сна в ${getMonthPrepositionalName(currentMonthKey)}</span>
      <small>${sleepDays} из ${monthRows.length} заполненных дней</small>
    </div>
    <p class="insight-summary">${meaningful.length
      ? `Есть заметная связь с ${meaningful[0].label}: r=${meaningful[0].result.r.toFixed(2)}.`
      : "Заметной корреляции сна с препаратами за весь период не обнаружено."}</p>
    <div class="correlation-list">
      ${results.map((item) => renderCorrelationRow(item.label, item.result)).join("")}
    </div>
  `;
}

function calculateCorrelation(rows, getFirst, getSecond) {
  return calculateCorrelationPairs(rows.map((row) => [getFirst(row), getSecond(row)]));
}

function renderCorrelationRow(label, result) {
  if (result.r === null) {
    return `<div class="correlation-row"><span>${label}</span><small>${result.note}</small></div>`;
  }
  const strength = Math.abs(result.r) >= 0.5 ? "заметная" : Math.abs(result.r) >= 0.3 ? "умеренная" : "слабая";
  return `<div class="correlation-row"><span>${label}</span><strong>r=${result.r.toFixed(2)}</strong><small>${strength}, n=${result.n}</small></div>`;
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
    fluoxetine: "Флуоксетин",
    zilaxera: "Зилаксера",
    tritticoAtarax: "Триттико / Атаракс",
    lithiumMg: "Литий",
    euthyroxMg: "Эутирокс"
  };
  const medicationRows = Object.keys(labels).map((key) => {
    const beforeValue = formatMedicationValue(key, before[key]);
    const afterValue = formatMedicationValue(key, after[key]);
    const value = before[key] === after[key] ? `${afterValue} (без изменений)` : `${beforeValue} → ${afterValue}`;
    return `<span class="medication-change"><b>${labels[key]}</b>: ${value}</span>`;
  });
  const changed = Object.keys(labels).some((key) => before[key] !== after[key]);

  return `
    <article class="comparison-card medication-comparison ${changed ? "changed" : "neutral"}">
      <span>Препараты</span>
      <div class="medication-change-list">${medicationRows.join("")}</div>
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
  return key === "lithiumMg" || key === "euthyroxMg" ? `${value} мг` : `${value}`;
}

function getMonthName(monthKey) {
  const month = Number(monthKey.split("-")[1]);
  const names = [
    "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"
  ];
  return names[month - 1] || "текущий месяц";
}

function getShortMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  const names = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  return `${names[Number(month) - 1] || month} ${year.slice(2)}`;
}

function getMonthPrepositionalName(monthKey) {
  const month = Number(monthKey.split("-")[1]);
  const names = [
    "январе", "феврале", "марте", "апреле", "мае", "июне",
    "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"
  ];
  return names[month - 1] || "текущем месяце";
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
    renderMonthlyAverages(currentRows);
    renderWeeklyEnergyVariability(currentRows);
    renderInsights(currentRows, data.today);

    reportButton.addEventListener("click", () => createReport(currentRows));
    correlationSelectEl?.addEventListener("change", () => renderCustomCorrelation(currentRows));
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
