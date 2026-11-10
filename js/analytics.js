// Яндекс Метрика: посещаемость, вебвизор и цели — ключевые действия игрока.
// Самостоятельный файл без зависимостей: подключается и на index.html, и на страницах
// тарифов, оферты, политики и контактов.
'use strict';

// Номер счётчика из metrika.yandex.ru. 0 — Метрика выключена.
const METRIKA_ID = 114173607;
// Считаем только боевой сайт: локальные проверки не должны портить статистику.
const ANALYTICS_ENABLED = METRIKA_ID > 0 && /(^|\.)chesai\.ru$/.test(location.hostname);

(function loadMetrika() {
  if (!ANALYTICS_ENABLED) return;
  window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
  window.ym.l = Date.now();
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}`;
  document.head.appendChild(script);
  window.ym(METRIKA_ID, 'init', {
    ssr: true,
    referrer: document.referrer,
    url: location.href,
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true, // поля с email и паролями помечены ym-disable-keys и не записываются
  });
})();

// Цель Метрики. Имя должно совпадать с идентификатором цели «JavaScript-событие»
// в настройках счётчика. Ошибки аналитики никогда не ломают приложение.
function trackGoal(name, params) {
  try {
    if (ANALYTICS_ENABLED) window.ym(METRIKA_ID, 'reachGoal', name, params);
    else if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) console.debug('[goal]', name, params || '');
  } catch (e) { /* без аналитики приложение работает как обычно */ }
}
