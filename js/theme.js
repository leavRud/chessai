// Тёмная/светлая тема и SVG-фигуры доски.
'use strict';

/* =========================================================================
   ТЁМНАЯ ТЕМА
   ========================================================================= */
// Сменились тема или акцентный цвет — то, что рисуется на canvas (снегопад),
// само CSS-переменные не подхватит и перечитывает цвета по этому событию.
const PALETTE_CHANGED_EVENT = 'chessai:palette-changed';

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('chessTheme', theme);
  document.dispatchEvent(new Event(PALETTE_CHANGED_EVENT));
  const icon = $id('settingsThemeIcon');
  const label = $id('settingsThemeLabel');
  if (icon) icon.innerHTML = achievementIconSvg(theme === 'dark' ? 'moon' : 'sun');
  if (label) label.textContent = theme === 'dark' ? t('Тёмная') : t('Светлая');
}
(function initTheme() {
  const saved = localStorage.getItem('chessTheme') || 'dark';
  applyTheme(saved);
})();
function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  applyTheme(isDark ? 'light' : 'dark');
}

/* =========================================================================
   ФИГУРЫ ДОСКИ (SVG)
   ========================================================================= */
// Собственный набор в духе Стаунтона: формы нарисованы в квадрате 100×100,
// одни на обе стороны — цвета подставляет buildPieceSvg. Каждая фигура
// собрана из частей с заливкой и обводкой, поэтому стыки частей сами
// становятся прорисовкой. Класс d — линия цветом обводки, e — точка (глаз).
// Раньше были символы шрифта: на Windows, Android и iOS они выглядели по-разному.
const PIECE_BASE = '<path d="M26 78 H74 Q78 78 78 82 V88 H22 V82 Q22 78 26 78 Z"/>';
const PIECE_SHAPES = {
  P: '<path d="M41 48 Q45 54 44 61 Q42 70 32 78 H68 Q58 70 56 61 Q55 54 59 48 Z"/>' +
    '<rect x="36" y="43" width="28" height="6" rx="3"/><circle cx="50" cy="31" r="11.5"/>',
  R: '<path d="M35 44 H65 L62 72 H38 Z"/><rect x="32" y="71" width="36" height="7" rx="2"/>' +
    '<rect x="32" y="39" width="36" height="6" rx="2"/>' +
    '<path d="M30 16 H38 V22 H45 V16 H55 V22 H62 V16 H70 V34 Q70 39 65 39 H35 Q30 39 30 34 Z"/>',
  B: '<path d="M43 54 Q47 63 42 70 L36 78 H64 L58 70 Q53 63 57 54 Z"/><rect x="37" y="48" width="26" height="6" rx="3"/>' +
    '<path d="M50 15 C40 23 35 33 38 42 Q40 48 50 48 Q60 48 62 42 C65 33 60 23 50 15 Z"/>' +
    '<circle cx="50" cy="12" r="4"/><path class="d" d="M55 25 L46 37"/>',
  N: '<path d="M66 78 C71 64 72 48 66 34 C62 24 56 19 48 17 L46 9 L40 18 C33 23 26 34 22 46 Q20 53 27 55 ' +
    'L35 52 Q41 50 45 46 C46 55 38 63 36 70 L34 78 Z"/>' +
    '<circle class="e" cx="40" cy="30" r="2.6"/><circle class="e" cx="26.5" cy="47" r="1.4"/>' +
    '<path class="d" d="M55 21 C63 31 65 50 61 70"/>',
  Q: '<path d="M39 60 Q45 68 40 72 L34 78 H66 L60 72 Q55 68 61 60 Z"/><rect x="33" y="54" width="34" height="6" rx="3"/>' +
    '<path d="M26 30 L35 54 H65 L74 30 L62 42 L63 24 L54 40 L50 21 L46 40 L37 24 L38 42 Z"/>' +
    '<circle cx="26" cy="27" r="4"/><circle cx="37" cy="21" r="4"/><circle cx="50" cy="17" r="4"/>' +
    '<circle cx="63" cy="21" r="4"/><circle cx="74" cy="27" r="4"/>',
  K: '<path d="M39 58 Q45 66 40 72 L34 78 H66 L60 72 Q55 66 61 58 Z"/><rect x="33" y="52" width="34" height="6" rx="3"/>' +
    '<path d="M50 24 C40 24 30 26 30 34 Q30 43 36 52 H64 Q70 43 70 34 C70 26 60 24 50 24 Z"/>' +
    '<path class="d" d="M34 41 Q50 36 66 41"/><path d="M47 5 H53 V10 H58 V16 H53 V24 H47 V16 H42 V10 H47 Z"/>',
};
function buildPieceSvg(piece) {
  const isWhite = piece[0] === 'w';
  // Цвет стороны даёт заливка, читаемость на любой клетке — обводка:
  // у белых тёмная, у чёрных яркая (иначе на тёмных клетках их не видно).
  const fill = isWhite ? '#F6F1E6' : '#141210';
  const stroke = isWhite ? '#5E2C2E' : '#E0B85C';
  // viewBox чуть меньше квадрата 100×100: фигура крупнее в клетке
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 1 92 92">` +
    `<style>.d{fill:none;stroke-linecap:round}.e{fill:${stroke};stroke:none}</style>` +
    `<g fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round">` +
    PIECE_BASE + PIECE_SHAPES[piece[1]] + `</g></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}
const PIECE_THEME_CACHE = {};
function pieceThemeFn(piece) {
  if (!PIECE_THEME_CACHE[piece]) PIECE_THEME_CACHE[piece] = buildPieceSvg(piece);
  return PIECE_THEME_CACHE[piece];
}
