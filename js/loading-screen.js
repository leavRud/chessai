// Экран загрузки: прячется, когда готовы шрифты и страница.
'use strict';

/* =========================================================================
   ЭКРАН ЗАГРУЗКИ
   Скрывается, когда готовы шрифты, полная загрузка окна (скрипты/картинки/
   стили) и фон загрузки (кони собрались в кольцо, см. js/loading-background.js).
   Движок Stockfish (~7 МБ) не ждём: он догружается в фоне, а ход соперника
   при необходимости подождёт его сам (см. waitForEngine в js/engine.js).
   ========================================================================= */
const loadingReadyFlags = { fonts: false, windowLoad: false, background: false };
let loadingScreenHidden = false;

function markLoadingReady(flag) {
  loadingReadyFlags[flag] = true;
  const flags = Object.values(loadingReadyFlags);
  updateLoadingBackground(flags.filter(Boolean).length / flags.length);
  maybeHideLoadingScreen();
}

function maybeHideLoadingScreen() {
  if (loadingScreenHidden) return;
  if (Object.values(loadingReadyFlags).every(Boolean)) hideLoadingScreen();
}

function hideLoadingScreen() {
  if (loadingScreenHidden) return;
  loadingScreenHidden = true;
  const el = $id('loadingScreen');
  if (!el) return;
  finishLoadingBackground();
  el.classList.add('is-hidden');
  setTimeout(() => { el.style.display = 'none'; }, 500);
}

(function initLoadingScreenWatchers() {
  // Шрифты
  const fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  fontsReady.then(() => markLoadingReady('fonts')).catch(() => markLoadingReady('fonts'));

  // Полная загрузка окна (картинки, стили, все <script>)
  if (document.readyState === 'complete') {
    markLoadingReady('windowLoad');
  } else {
    window.addEventListener('load', () => markLoadingReady('windowLoad'), { once: true });
  }

  loadingBackgroundReady.then(() => markLoadingReady('background'));
})();
