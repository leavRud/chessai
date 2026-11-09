// Фон экрана загрузки продолжает выбранный фон главного экрана: кони собираются
// в кольцо вокруг логотипа, а снегопад передаётся главному экрану без рывка.
'use strict';

/* =========================================================================
   ОБЩЕЕ С ФОНОМ ГЛАВНОГО ЭКРАНА
   Файл подключён сразу за разметкой загрузки, раньше тяжёлых скриптов, чтобы
   анимация шла с первых кадров. Поэтому он ни на что не опирается, а
   js/home-background.js берёт отсюда сетку и фигуры снегопада.
   ========================================================================= */

// Телефоны и планшеты: мыши нет, поэтому кони ходят на автопилоте, а палец
// их направляет. На ПК поведение прежнее — кони всегда идут за мышью.
const HOME_TOUCH_MEDIA = window.matchMedia('(hover: none) and (pointer: coarse)');

function computeHomeGrid(layer, bgSelector) {
  const rect = layer.getBoundingClientRect();
  const containerWidth = rect.width;
  const containerHeight = rect.height;
  const rows = 24;
  const cellH = containerHeight / rows;
  // Клетки фона рисует CSS. Размер берём отсюда же: на телефонах 100vh в CSS
  // больше видимой высоты (адресная строка), и фигуры уезжали бы с клеток.
  const bg = document.querySelector(bgSelector);
  if (bg) bg.style.setProperty('--cell', `${cellH}px`);
  // Клетки фона в CSS квадратные (--cell), поэтому и фигуры ставим по
  // квадратным клеткам. Если растянуть ширину клетки на весь экран, ошибка
  // копится слева направо и у правого края фигуры съезжают с центра клеток.
  // Неполная клетка у правого края остаётся пустой.
  const cols = Math.max(6, Math.floor(containerWidth / cellH));
  return { rect, rows, cols, cellW: cellH, cellH };
}

const HOME_SNOW_GLYPHS = '♚♛♜♝♞♟♞♟♟';

// Масштаб фигур и их число зависят только от размера экрана
function homeSnowMetrics(rect) {
  return {
    scale: Math.max(1, Math.min(1.6, Math.min(rect.width, rect.height) / 420)),
    count: Math.max(26, Math.min(90, Math.round(rect.width * rect.height / 12000))),
  };
}

// Спокойная скорость падения: ближние фигуры падают быстрее дальних
function homeSnowFallSpeed(z, scale) {
  return (12 + z * 38) * scale;
}

function makeHomeSnowFlake(snow) {
  const z = 0.25 + Math.random() * 0.75; // глубина: дальние мелкие и тусклые
  return {
    x: Math.random() * snow.w,
    y: -40,
    z,
    glyph: HOME_SNOW_GLYPHS[Math.floor(Math.random() * HOME_SNOW_GLYPHS.length)],
    tone: Math.random() < 0.45 ? 0 : 1, // индекс в snow.colors
    phase: Math.random() * Math.PI * 2,
    rot: (Math.random() - 0.5) * 0.6,
    spin: (Math.random() - 0.5) * 0.4,
    vx: 0,
    vy: homeSnowFallSpeed(z, snow.scale),
  };
}

function readHomeSnowColors() {
  const css = getComputedStyle(document.documentElement);
  return [css.getPropertyValue('--gold').trim() || '#d4a547', css.getPropertyValue('--text-muted').trim() || '#888'];
}

function drawHomeSnowGlyph(ctx, f, snow, size, alpha) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.rot);
  ctx.scale(size, size);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = snow.colors[f.tone];
  ctx.font = `${Math.round((12 + f.z * 26) * snow.scale)}px "Segoe UI Symbol", "DejaVu Sans", serif`;
  ctx.fillText(f.glyph, 0, 0);
  ctx.restore();
}

/* =========================================================================
   «СБОР РОЯ»: кони прыгают к логотипу и встают кольцом, оно и есть прогресс
   ========================================================================= */
const LOADING_SWARM_SIZE = 12;      // столько же коней на главном экране
const LOADING_SWARM_HOP_MS = 170;
const LOADING_SWARM_ARRIVE_CELLS = 3; // отсюда конь одним прыжком встаёт на место
const LOADING_SWARM_RADIUS = 165;   // px: кольцо обходит логотип и подпись
const LOADING_SWARM_MOVES = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

let loadingSwarm = null;
let loadingSnow = null;

// Закончила ли анимация то, что должна показать, прежде чем экран скроется
let resolveLoadingBackground;
const loadingBackgroundReady = new Promise(resolve => { resolveLoadingBackground = resolve; });

function placeLoadingKnight(knight) {
  const { cellW, cellH } = loadingSwarm.grid;
  const x = knight.col * cellW + cellW / 2;
  const y = knight.row * cellH + cellH / 2;
  knight.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
}

// Клетки кольца: равномерно по кругу вокруг центра экрана, начиная сверху
function layoutLoadingRing() {
  const { rect, cellW, cellH } = loadingSwarm.grid;
  const radius = Math.min(LOADING_SWARM_RADIUS, rect.width / 2 - cellW * 1.5, rect.height / 2 - cellH * 1.5);
  loadingSwarm.knights.forEach((knight, i) => {
    const angle = i / LOADING_SWARM_SIZE * Math.PI * 2 - Math.PI / 2;
    knight.goalCol = Math.round((rect.width / 2 + Math.cos(angle) * radius) / cellW - 0.5);
    knight.goalRow = Math.round((rect.height / 2 + Math.sin(angle) * radius) / cellH - 0.5);
  });
}

function hopLoadingKnight(knight) {
  const { rows, cols } = loadingSwarm.grid;
  const distance = (row, col) => Math.abs(row - knight.goalRow) + Math.abs(col - knight.goalCol);
  if (distance(knight.row, knight.col) <= LOADING_SWARM_ARRIVE_CELLS) {
    knight.row = knight.goalRow;
    knight.col = knight.goalCol;
    knight.arrived = true;
    return;
  }
  let best = null;
  for (const [dc, dr] of LOADING_SWARM_MOVES) {
    const row = knight.row + dr;
    const col = knight.col + dc;
    if (row < 0 || row >= rows || col < 0 || col >= cols) continue;
    if (!best || distance(row, col) < distance(best.row, best.col)) best = { row, col };
  }
  if (best) Object.assign(knight, best);
}

function stepLoadingSwarm() {
  const swarm = loadingSwarm;
  if (!swarm) return;
  swarm.knights.filter(knight => !knight.arrived).forEach(knight => {
    hopLoadingKnight(knight);
    placeLoadingKnight(knight);
  });
  if (swarm.knights.every(knight => knight.arrived)) {
    clearInterval(swarm.timer);
    resolveLoadingBackground();
  }
}

function resizeLoadingSwarm() {
  if (!loadingSwarm) return;
  loadingSwarm.grid = computeHomeGrid(loadingSwarm.layer, '.loading-board-bg');
  layoutLoadingRing();
  loadingSwarm.knights.forEach(knight => {
    if (knight.arrived) {
      knight.row = knight.goalRow;
      knight.col = knight.goalCol;
    }
    placeLoadingKnight(knight);
  });
}

function startLoadingSwarm(layer) {
  const grid = computeHomeGrid(layer, '.loading-board-bg');
  const knights = [];
  for (let i = 0; i < LOADING_SWARM_SIZE; i++) {
    const el = document.createElement('div');
    el.className = 'loading-swarm-knight';
    el.textContent = '♞';
    layer.appendChild(el);
    knights.push({
      el,
      row: Math.floor(Math.random() * grid.rows),
      col: Math.floor(Math.random() * grid.cols),
      arrived: false,
    });
  }
  loadingSwarm = { layer, grid, knights, timer: 0 };
  layoutLoadingRing();
  window.addEventListener('resize', resizeLoadingSwarm);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    knights.forEach(knight => Object.assign(knight, { row: knight.goalRow, col: knight.goalCol, arrived: true }));
    resolveLoadingBackground();
  } else {
    loadingSwarm.timer = setInterval(stepLoadingSwarm, LOADING_SWARM_HOP_MS);
  }
  knights.forEach(placeLoadingKnight);
}

/* =========================================================================
   «ТИХИЙ СНЕГОПАД»: те же фигуры, что потом упадут на главном экране
   ========================================================================= */
function resizeLoadingSnow() {
  const snow = loadingSnow;
  if (!snow) return;
  const rect = snow.canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const { scale, count } = homeSnowMetrics(rect);
  Object.assign(snow, { w: rect.width, h: rect.height, scale });
  snow.canvas.width = Math.round(rect.width * dpr);
  snow.canvas.height = Math.round(rect.height * dpr);
  snow.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  while (snow.flakes.length < count) {
    const flake = makeHomeSnowFlake(snow);
    flake.y = Math.random() * rect.height;
    snow.flakes.push(flake);
  }
  snow.flakes.length = count;
  snow.flakes.sort((a, b) => a.z - b.z);
}

function drawLoadingSnow(now) {
  const s = loadingSnow;
  if (!s) return;
  const dt = Math.min(0.05, (now - s.lastFrame) / 1000) * (s.slow ? 0.35 : 1);
  s.lastFrame = now;
  const ctx = s.ctx;
  ctx.clearRect(0, 0, s.w, s.h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of s.flakes) {
    f.vx = Math.sin(now / 1400 + f.phase) * 7 * f.z;
    f.vy = homeSnowFallSpeed(f.z, s.scale);
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.rot += (f.spin + f.vx * 0.0015) * dt;
    if (f.x < -40) f.x += s.w + 80;
    if (f.x > s.w + 40) f.x -= s.w + 80;
    if (f.y > s.h + 40) Object.assign(f, makeHomeSnowFlake(s));
    drawHomeSnowGlyph(ctx, f, s, 1, 0.12 + f.z * 0.6);
  }
  ctx.globalAlpha = 1;
  s.raf = requestAnimationFrame(drawLoadingSnow);
}

function startLoadingSnow(layer) {
  const canvas = document.createElement('canvas');
  canvas.className = 'home-snow-layer';
  layer.appendChild(canvas);
  loadingSnow = {
    canvas,
    ctx: canvas.getContext('2d'),
    flakes: [],
    colors: readHomeSnowColors(),
    slow: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    lastFrame: performance.now(),
    raf: 0,
  };
  resizeLoadingSnow();
  window.addEventListener('resize', resizeLoadingSnow);
  loadingSnow.raf = requestAnimationFrame(drawLoadingSnow);
  resolveLoadingBackground(); // снегопаду нечего дожидаться
}

/* =========================================================================
   СВЯЗЬ С ЭКРАНОМ ЗАГРУЗКИ
   ========================================================================= */

// progress от 0 до 1: кольцо загорается по часовой стрелке
function updateLoadingBackground(progress) {
  if (!loadingSwarm) return;
  const lit = Math.round(progress * LOADING_SWARM_SIZE);
  loadingSwarm.knights.forEach((knight, i) => knight.el.classList.toggle('is-lit', i < lit));
}

// Вызывается в момент скрытия экрана: главный экран продолжает с того же места
function finishLoadingBackground() {
  if (loadingSwarm) {
    clearInterval(loadingSwarm.timer);
    window.removeEventListener('resize', resizeLoadingSwarm);
    adoptLoadingSwarm(loadingSwarm.knights);
    loadingSwarm = null;
  }
  if (loadingSnow) {
    cancelAnimationFrame(loadingSnow.raf);
    window.removeEventListener('resize', resizeLoadingSnow);
    if (adoptLoadingSnow(loadingSnow.flakes)) {
      // Тот же снег уже идёт на главном экране: убираем свой фон и проявляем интерфейс
      loadingSnow.canvas.remove();
      document.getElementById('loadingScreen').classList.add('is-seamless');
      document.querySelectorAll('.home-topbar, .home-center, .home-footer').forEach(el => {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: 'ease' });
      });
    }
    loadingSnow = null;
  }
}

(function initLoadingBackground() {
  const layer = document.getElementById('loadingBackdrop');
  if (document.documentElement.dataset.homeBg === 'snow') startLoadingSnow(layer);
  else startLoadingSwarm(layer);
})();
