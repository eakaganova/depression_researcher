const factorDashboardForLanguage = document.querySelector("#predictorDashboard");

function replaceExactText(root, selector, replacements) {
  root.querySelectorAll(selector).forEach((element) => {
    const replacement = replacements[element.textContent.trim()];
    if (replacement) element.textContent = replacement;
  });
}

function simplifyFactorLanguage() {
  if (!factorDashboardForLanguage?.children.length) return;

  const heading = factorDashboardForLanguage.querySelector(".predictor-toolbar strong");
  if (heading) heading.textContent = "Как менялась энергия после разных событий";

  const intro = factorDashboardForLanguage.querySelector(".predictor-toolbar small");
  if (intro) intro.textContent = "Сравнение с уровнем, который ожидался по динамике предыдущих дней";

  const summaryCards = factorDashboardForLanguage.querySelectorAll(".predictor-summary article");
  const summaryLabels = [
    "Наиболее заметная связь",
    "Средняя ошибка прогноза энергии",
    "Преимущество перед простым прогнозом"
  ];
  summaryCards.forEach((card, index) => {
    const label = card.querySelector("span");
    if (label && summaryLabels[index]) label.textContent = summaryLabels[index];
  });
  if (summaryCards[0]?.querySelector("small")) {
    const current = summaryCards[0].querySelector("small").textContent;
    summaryCards[0].querySelector("small").textContent = current.replace("балла к ожидаемому уровню", "балла относительно обычной динамики");
  }
  if (summaryCards[1]?.querySelector("small")) {
    summaryCards[1].querySelector("small").textContent = summaryCards[1].querySelector("small").textContent.replace("наивный прогноз", "если считать, что завтра будет как сегодня");
  }
  if (summaryCards[2]?.querySelector("small")) {
    summaryCards[2].querySelector("small").textContent = summaryCards[2].querySelector("small").textContent.replace("последовательных проверок", "дней проверено по очереди");
  }

  factorDashboardForLanguage.querySelector(".predictor-method-note")?.remove();

  const headers = factorDashboardForLanguage.querySelectorAll(".predictor-ranking-head span");
  const headerLabels = [
    "Фактор",
    "Изменение энергии после фактора",
    "Устойчивость направления",
    "Надёжность наблюдения"
  ];
  headers.forEach((header, index) => {
    if (headerLabels[index]) header.textContent = headerLabels[index];
  });

  replaceExactText(factorDashboardForLanguage, ".predictor-reliability strong", {
    "устойчивый сигнал": "повторяющаяся связь",
    "возможный сигнал": "возможная связь",
    "сигнал не подтверждён": "явной связи пока нет",
    "очень мало данных": "слишком мало наблюдений"
  });
  replaceExactText(factorDashboardForLanguage, ".predictor-reliability small", {
    "вероятность отрицательного отклонения": "насколько устойчиво энергия была ниже ожидаемой",
    "после Bayesian shrinkage": "с учётом небольшого числа наблюдений"
  });

  factorDashboardForLanguage.querySelectorAll(".predictor-effect small").forEach((element) => {
    element.textContent = element.textContent.replace("90% интервал:", "примерный диапазон:");
  });

  const disclaimer = factorDashboardForLanguage.querySelector(".predictor-disclaimer");
  if (disclaimer) {
    disclaimer.textContent = "Это наблюдение по личному дневнику, а не доказательство причины. Отрицательное значение означает, что после этого фактора энергия чаще была ниже ожидаемого уровня. Выводы о препаратах можно обсуждать только вместе с врачом.";
  }
}

if (factorDashboardForLanguage) {
  const observer = new MutationObserver(() => {
    observer.disconnect();
    simplifyFactorLanguage();
    observer.observe(factorDashboardForLanguage, { childList: true, subtree: true });
  });
  observer.observe(factorDashboardForLanguage, { childList: true, subtree: true });
  simplifyFactorLanguage();
}
