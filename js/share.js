// «Поделиться»: ссылка на персонажа (chesai.ru/?c=<id>) и картинка с итогом партии.
// Профиль персонажа хранится в Supabase (таблица shared_characters): по ссылке его
// видит и гость, а сыграть можно после входа — тогда карточка откроется снова.
'use strict';

// Внутри VK ссылки ведут в мини-приложение (см. js/vk.js)
const SHARE_BASE_URL = appHomeLink();
const SHARE_ID_RE = /^[0-9a-f]{10}$/;
const PENDING_SHARED_CHAR_KEY = 'chessPendingSharedChar';

/* =========================================================================
   ОБЩЕЕ: системное меню «Поделиться» или копирование ссылки
   ========================================================================= */

// Возвращает 'shared' | 'copied' | 'cancelled' | 'blocked' | 'failed'.
// 'blocked' — браузер (чаще Safari) не дал открыть меню: от нажатия прошло слишком много
// времени, пока мы готовили ссылку или картинку. Повторное нажатие сработает сразу.
async function shareOrCopy({ title, text, url, files }) {
  if (IS_VK) return vkShare({ url, files });
  const data = { title, text, url };
  if (files && navigator.canShare?.({ files })) data.files = files;
  if (navigator.share && (!files || data.files)) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      if (e && e.name === 'NotAllowedError') return 'blocked';
      // Отказ системы (нет жеста, неподдерживаемые данные) — переходим к копированию
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`.trim());
    return 'copied';
  } catch (e) {
    return 'failed';
  }
}

function setBusy(btn, busy) {
  btn.disabled = busy;
  btn.classList.toggle('is-busy', busy);
}

/* =========================================================================
   ССЫЛКА НА ПЕРСОНАЖА
   ========================================================================= */

function sharedCharacterUrl(id) {
  return appLink('c', id);
}

// То, что храним в базе: только исходные поля, производные пересчитает normalize.
function characterShareProfile(c) {
  const { shareId, openings, ...profile } = c;
  return profile;
}

// Профиль из базы (или из sessionStorage) мог быть подделан — пропускаем через ту же
// нормализацию, что и ответ нейросети: обрезка строк, рамки чисел, дебюты из книги.
function normalizeSharedCharacter(raw, shareId) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const rep = p.repertoire && typeof p.repertoire === 'object' ? p.repertoire : {};
  const profile = normalizeCharacterProfile(
    { ...p, white: rep.w, defenses: [rep.e4, rep.d4] },
    { type: 'desc', value: '' },
  );
  if (shareId) profile.shareId = shareId;
  return profile;
}

// Сохраняет персонажа и возвращает id ссылки. Один персонаж — одна ссылка.
async function ensureCharacterShareId(c) {
  if (c.shareId) return c.shareId;
  const { data, error } = await sb.from('shared_characters')
    .insert({ profile: characterShareProfile(c) })
    .select('id')
    .single();
  if (error || !data) throw error || new Error('no id');
  c.shareId = data.id;
  return data.id;
}

function countSharedCharacterPlay(id) {
  sb.rpc('count_shared_character_play', { p_id: id }).then(() => {}, () => {});
}

function showSharedCharacterCard(profile) {
  state.character = profile;
  charState.fromLink = true;
  charState.lastInput = null;
  hideModal('characterSetupModal');
  $id('charCardError').classList.add('hidden');
  renderCharacterCard(profile);
  setCharCardLoading(false);
  showModal('characterCardModal');
}

// chesai.ru/?c=<id> — открываем карточку персонажа поверх главного экрана.
async function openSharedCharacterFromUrl() {
  const params = new URLSearchParams(location.search);
  const id = params.get('c');
  if (id === null) return;
  params.delete('c');
  const rest = params.toString();
  history.replaceState(history.state, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
  if (!SHARE_ID_RE.test(id)) { showToast(t('Ссылка на персонажа повреждена')); return; }

  const loadingText = $id('characterCardLoading').querySelector('p');
  const defaultLoadingText = loadingText.textContent;
  loadingText.textContent = t('Загружаем персонажа…');
  $id('charCardError').classList.add('hidden');
  setCharCardLoading(true);
  showModal('characterCardModal');
  const { data, error } = await sb.from('shared_characters').select('profile').eq('id', id).maybeSingle();
  loadingText.textContent = defaultLoadingText;
  if (error || !data) {
    hideModal('characterCardModal');
    showToast(t('Персонаж по ссылке не найден'));
    return;
  }
  trackGoal('character_link_open');
  showSharedCharacterCard(normalizeSharedCharacter(data.profile, id));
}

// Гость нажал «Играть» на карточке по ссылке → вошёл → показываем ту же карточку.
function rememberPendingSharedCharacter() {
  try { sessionStorage.setItem(PENDING_SHARED_CHAR_KEY, JSON.stringify(state.character)); } catch (e) { /* без хранилища */ }
}

function resumePendingSharedCharacter() {
  if (!chatSignedIn) return;
  let raw = null;
  try { raw = sessionStorage.getItem(PENDING_SHARED_CHAR_KEY); sessionStorage.removeItem(PENDING_SHARED_CHAR_KEY); } catch (e) { /* нет хранилища */ }
  if (!raw) return;
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return; }
  const shareId = SHARE_ID_RE.test(parsed?.shareId) ? parsed.shareId : null;
  hideModal('authModal');
  showSharedCharacterCard(normalizeSharedCharacter(parsed, shareId));
}

$id('charCardShareBtn').addEventListener('click', async () => {
  const c = state.character;
  if (!c) return;
  playSound('ui');
  const btn = $id('charCardShareBtn');
  setBusy(btn, true);
  try {
    const id = await ensureCharacterShareId(c);
    const outcome = await shareOrCopy({
      title: t('{name} — шахматы на chesai', { name: c.name }),
      text: t('Сыграй в шахматы с персонажем «{name}» (≈{elo} Elo) — им управляет нейросеть.', { name: c.name, elo: c.elo }),
      url: sharedCharacterUrl(id),
    });
    if (outcome === 'copied') showToast(t('Ссылка на персонажа скопирована'));
    else if (outcome === 'blocked') showToast(t('Ссылка готова — нажмите «Поделиться» ещё раз'));
    else if (outcome === 'failed') showToast(t('Не удалось поделиться ссылкой'));
    if (outcome === 'shared' || outcome === 'copied') trackGoal('character_share', { via: outcome });
  } catch (e) {
    console.error('Не удалось сохранить персонажа для ссылки:', e);
    showToast(chatSignedIn ? t('Не удалось создать ссылку. Попробуйте ещё раз') : t('Войдите, чтобы делиться персонажами'));
  } finally {
    setBusy(btn, false);
  }
});

/* =========================================================================
   КАРТИНКА С ИТОГОМ ПАРТИИ
   1080×1350 (4:5) — подходит для историй, ленты VK и Telegram.
   ========================================================================= */
const CARD_W = 1080;
const CARD_H = 1350;

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Перенос по словам; лишнее обрезаем многоточием на последней строке.
function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (ctx.measureText(probe).width <= maxWidth || !line) { line = probe; continue; }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  else if (line && lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

function fitFont(ctx, text, weight, size, family, maxWidth, minSize) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > minSize && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

async function drawBoard(ctx, fen, orientation, x, y, size) {
  const sq = size / 8;
  const light = '#F0E7D8';
  const dark = '#9C7B54';
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  roundRectPath(ctx, x, y, size, size, 22);
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRectPath(ctx, x, y, size, size, 22);
  ctx.clip();
  const rows = fen.split(' ')[0].split('/');
  const pieces = [];
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) { f += Number(ch); continue; }
      pieces.push({ r, f, code: (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase() });
      f++;
    }
  }
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      ctx.fillStyle = (r + f) % 2 === 0 ? light : dark;
      ctx.fillRect(x + f * sq, y + r * sq, sq, sq);
    }
  }
  const codes = [...new Set(pieces.map(p => p.code))];
  const images = {};
  await Promise.all(codes.map(async code => { images[code] = await loadImage(pieceThemeFn(code)); }));
  for (const p of pieces) {
    const col = orientation === 'b' ? 7 - p.f : p.f;
    const row = orientation === 'b' ? 7 - p.r : p.r;
    ctx.drawImage(images[p.code], x + col * sq, y + row * sq, sq, sq);
  }
  ctx.restore();
}

// Что написать на карточке и в подписи: заголовок, соперник, текст для мессенджера.
function describeResultForShare(rec) {
  const title = $id('resultTitle').textContent.trim() || t('Партия окончена');
  const moves = rec.moves || 0;
  const movesText = `${moves} ${plural(moves, 'ход', 'хода', 'ходов')}`;
  let opponent = '';
  let text;
  if (rec.mode === 'characters' && rec.opponent) {
    opponent = t('Соперник: {name} · ≈{elo} Elo', { name: rec.opponent, elo: rec.opponent_elo });
    text = rec.result === 'win'
      ? t('Победа над персонажем «{name}» за {moves}! Сможешь так же?', { name: rec.opponent, moves: movesText })
      : rec.result === 'loss'
        ? t('Персонаж «{name}» оказался сильнее. Попробуй обыграть его сам:', { name: rec.opponent })
        : t('Ничья с персонажем «{name}». Сыграешь лучше?', { name: rec.opponent });
  } else if (rec.mode === 'ai') {
    opponent = t('Соперник: Stockfish · ≈{elo} Elo', { elo: rec.opponent_elo });
    text = rec.result === 'win'
      ? t('Обыграл(а) Stockfish (≈{elo} Elo) за {moves}! Сможешь так же?', { elo: rec.opponent_elo, moves: movesText })
      : rec.result === 'loss'
        ? t('Stockfish (≈{elo} Elo) снова сильнее. Попробуй сам:', { elo: rec.opponent_elo })
        : t('Ничья со Stockfish (≈{elo} Elo). Сыграешь лучше?', { elo: rec.opponent_elo });
  } else if (rec.mode === 'online' && rec.opponent) {
    opponent = t('Соперник: {name}', { name: rec.opponent });
    text = rec.result === 'win'
      ? t('Победа в шахматы над {name} за {moves}! Сыграем?', { name: rec.opponent, moves: movesText })
      : t('Сыграли партию в шахматы с {name} на chesai — сыграй и ты:', { name: rec.opponent });
  } else {
    opponent = t('Партия вдвоём');
    text = t('Сыграли партию в шахматы на chesai — попробуй и ты:');
  }
  return { title, opponent, text };
}

async function buildResultCard(rec) {
  const display = cssVar('--font-display', 'Georgia, serif');
  const body = cssVar('--font-body', 'sans-serif');
  try {
    await Promise.all([
      document.fonts.load(`700 96px ${display}`),
      document.fonts.load(`600 36px ${body}`),
      document.fonts.load(`700 56px ${body}`),
    ]);
  } catch (e) { /* шрифты не загрузились — нарисуем запасными */ }
  const accent = cssVar('--accent', '#AD8A4E');
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  const muted = 'rgba(240, 231, 216, 0.6)';
  const textColor = '#F4EEE4';
  const pad = 80;

  // Фон: тёмный с мягким свечением акцента сверху
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, '#1d1b18');
  bg.addColorStop(1, '#101010');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = ctx.createRadialGradient(CARD_W / 2, 120, 40, CARD_W / 2, 120, 700);
  glow.addColorStop(0, `${accent}55`);
  glow.addColorStop(1, `${accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const { title, opponent } = describeResultForShare(rec);
  const quote = rec.mode === 'characters' && !$id('characterResultBlock').classList.contains('hidden')
    ? lastCharacterResult?.comment : '';

  // Шапка
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = textColor;
  ctx.font = `700 54px ${display}`;
  ctx.fillText('chesai', pad, 120);
  ctx.textAlign = 'right';
  ctx.fillStyle = muted;
  ctx.font = `500 28px ${body}`;
  ctx.fillText(t('шахматы против нейросети'), CARD_W - pad, 112);

  // Итог
  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = `700 30px ${body}`;
  ctx.fillText($id('resultEyebrow').textContent.toUpperCase(), CARD_W / 2, 215);
  ctx.fillStyle = textColor;
  fitFont(ctx, title, 700, 100, display, CARD_W - pad * 2, 60);
  ctx.fillText(title, CARD_W / 2, 320);
  ctx.fillStyle = muted;
  fitFont(ctx, opponent, 600, 36, body, CARD_W - pad * 2, 24);
  ctx.fillText(opponent, CARD_W / 2, 380);

  // Доска: с цитатой персонажа — поменьше, чтобы реплика поместилась
  const boardSize = quote ? 480 : 600;
  const boardY = 425;
  const fen = state.game ? state.game.fen() : 'start';
  await drawBoard(ctx, fen === 'start' ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' : fen,
    rec.player_color, (CARD_W - boardSize) / 2, boardY, boardSize);

  // Цифры партии
  const statsY = boardY + boardSize + (quote ? 78 : 110);
  const stats = [
    [String(rec.moves || 0), $id('resultStatMoves').nextElementSibling.textContent],
    [formatTime(rec.duration_sec || 0), t('длилась партия')],
    [$id('resultStatCaptured').textContent, $id('resultStatCaptured').nextElementSibling.textContent],
  ];
  const colW = (CARD_W - pad * 2) / 3;
  stats.forEach(([value, label], i) => {
    const cx = pad + colW * i + colW / 2;
    ctx.fillStyle = textColor;
    ctx.font = `700 56px ${body}`;
    ctx.fillText(value, cx, statsY);
    ctx.fillStyle = muted;
    ctx.font = `500 26px ${body}`;
    ctx.fillText(label, cx, statsY + 40);
  });

  // Реплика персонажа
  if (quote) {
    const boxY = statsY + 70;
    const boxH = 165;
    roundRectPath(ctx, pad, boxY, CARD_W - pad * 2, boxH, 24);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.font = `italic 500 32px ${body}`;
    const lines = wrapLines(ctx, `«${quote}»`, CARD_W - pad * 2 - 72, 3);
    ctx.fillStyle = textColor;
    const lineH = 42;
    const firstY = boxY + boxH / 2 - ((lines.length - 1) * lineH) / 2 + 11;
    lines.forEach((l, i) => ctx.fillText(l, CARD_W / 2, firstY + i * lineH));
  }

  // Призыв
  ctx.fillStyle = accent;
  ctx.font = `700 36px ${body}`;
  ctx.fillText(t('Сыграй сам → chesai.ru'), CARD_W / 2, CARD_H - 62);

  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Готовая картинка последней партии: повторное нажатие не рисует её заново.
let resultShareCache = null;

$id('resultShareBtn').addEventListener('click', async () => {
  const rec = lastGameRecord;
  if (!rec) return;
  playSound('ui');
  const btn = $id('resultShareBtn');
  setBusy(btn, true);
  try {
    const quoteKey = lastCharacterResult?.comment || '';
    let cached = resultShareCache && resultShareCache.rec === rec && resultShareCache.quoteKey === quoteKey
      ? resultShareCache : null;
    if (!cached) {
      // Партия с персонажем — ссылка ведёт к нему же, иначе на главную
      let url = SHARE_BASE_URL;
      if (rec.mode === 'characters' && rec.character) {
        try { url = sharedCharacterUrl(await ensureCharacterShareId(rec.character)); } catch (e) { /* поделимся главной */ }
      }
      cached = resultShareCache = { rec, quoteKey, url, blob: await buildResultCard(rec) };
    }
    const { url, blob } = cached;
    const file = blob ? new File([blob], 'chesai.png', { type: 'image/png' }) : null;
    const { text } = describeResultForShare(rec);
    const files = file ? [file] : null;
    const canShareFile = files && navigator.canShare?.({ files });
    // Внутри VK картинка уходит в историю — системный canShare там не при чём
    const outcome = await shareOrCopy({ title: 'chesai', text, url, files: (canShareFile || IS_VK) ? files : null });
    if (outcome === 'blocked') {
      showToast(t('Картинка готова — нажмите «Поделиться» ещё раз'));
    } else if (outcome === 'copied' || outcome === 'failed') {
      // На компьютере меню «Поделиться» обычно нет: сохраняем картинку, а текст со ссылкой — в буфер
      if (blob) downloadBlob(blob, 'chesai.png');
      showToast(outcome === 'copied' ? t('Картинка сохранена, текст со ссылкой скопирован') : t('Картинка сохранена'));
    }
    if (outcome !== 'cancelled' && outcome !== 'blocked') trackGoal('result_share', { via: outcome, mode: rec.mode, result: rec.result });
  } catch (e) {
    console.error('Не удалось подготовить картинку итога:', e);
    showToast(t('Не удалось поделиться результатом'));
  } finally {
    setBusy(btn, false);
  }
});

/* =========================================================================
   GIF С ПАРТИЕЙ: вся партия ход за ходом, 480×600 (4:5).
   Кадры собирает gifenc (vendor/, грузится только по нажатию). Палитра одна на
   всю гифку, а в каждом кадре кроме первого прозрачны пиксели, которые не
   изменились, — поэтому файл весит сотни килобайт, а не мегабайты.
   ========================================================================= */
const GIF_W = 480;
const GIF_H = 600;
const GIF_BOARD = 432;
const GIF_BOARD_X = (GIF_W - GIF_BOARD) / 2;
const GIF_BOARD_Y = 112;
const GIF_TOTAL_MS = 36000;        // длинные партии проигрываем быстрее, чтобы гифка не тянулась
const GIF_MOVE_MS = [250, 650];    // рамки задержки на один ход
const GIF_START_MS = 1200;
const GIF_END_MS = 3500;
const GIF_LIGHT = '#F0E7D8';
const GIF_DARK = '#9C7B54';
const GIF_LAST_MOVE = 'rgba(232, 196, 90, 0.55)';
const GIF_CHECK = 'rgba(214, 64, 52, 0.75)';

let gifencLoading = null;
function loadGifenc() {
  if (window.gifenc) return Promise.resolve(window.gifenc);
  if (!gifencLoading) {
    gifencLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/gifenc-1.0.3.min.js';
      s.onload = () => (window.gifenc ? resolve(window.gifenc) : reject(new Error('gifenc')));
      s.onerror = () => { gifencLoading = null; reject(new Error('gifenc не загрузился')); };
      document.head.appendChild(s);
    });
  }
  return gifencLoading;
}

// Позиции партии по PGN: начальная и после каждого полухода.
function gifPositions(pgn) {
  const source = new Chess();
  if (!pgn || !source.load_pgn(pgn)) return [];
  const replay = new Chess();
  const frames = [{ board: replay.board(), last: null, check: null, label: '' }];
  source.history({ verbose: true }).forEach((m, i) => {
    replay.move(m.san);
    const board = replay.board();
    let check = null;
    if (replay.in_check()) {
      const turn = replay.turn();
      board.forEach((row, r) => row.forEach((p, f) => { if (p && p.type === 'k' && p.color === turn) check = { r, f }; }));
    }
    const num = Math.floor(i / 2) + 1;
    frames.push({ board, last: [m.from, m.to], check, label: `${num}${m.color === 'w' ? '.' : '…'} ${m.san}` });
  });
  return frames;
}

function gifSquareXY(square, orientation, sq) {
  let f = square.charCodeAt(0) - 97;
  let r = 8 - Number(square[1]);
  if (orientation === 'b') { f = 7 - f; r = 7 - r; }
  return [GIF_BOARD_X + f * sq, GIF_BOARD_Y + r * sq];
}

function drawGifFrame(ctx, frame, opts) {
  const { images, orientation, names, display, body, accent, index, total, final } = opts;
  const sq = GIF_BOARD / 8;
  const textColor = '#F4EEE4';
  const muted = 'rgba(240, 231, 216, 0.6)';

  ctx.fillStyle = '#16140f';
  ctx.fillRect(0, 0, GIF_W, GIF_H);

  // Шапка: логотип, номер хода, кто с кем играет
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = textColor;
  ctx.font = `700 30px ${display}`;
  ctx.fillText('chesai', GIF_BOARD_X, 46);
  ctx.textAlign = 'right';
  ctx.fillStyle = muted;
  ctx.font = `600 18px ${body}`;
  ctx.fillText(index ? t('Ход {n} из {total}', { n: Math.ceil(index / 2), total: Math.ceil(total / 2) }) : t('Начало партии'), GIF_W - GIF_BOARD_X, 44);
  ctx.textAlign = 'center';
  ctx.fillStyle = textColor;
  const vs = `${names.w}  —  ${names.b}`;
  fitFont(ctx, vs, 600, 20, body, GIF_BOARD, 13);
  ctx.fillText(vs, GIF_W / 2, 88);

  // Доска
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      ctx.fillStyle = (r + f) % 2 === 0 ? GIF_LIGHT : GIF_DARK;
      ctx.fillRect(GIF_BOARD_X + f * sq, GIF_BOARD_Y + r * sq, sq, sq);
    }
  }
  if (frame.last) {
    ctx.fillStyle = GIF_LAST_MOVE;
    frame.last.forEach(square => {
      const [x, y] = gifSquareXY(square, orientation, sq);
      ctx.fillRect(x, y, sq, sq);
    });
  }
  frame.board.forEach((row, r) => row.forEach((p, f) => {
    if (!p) return;
    const col = orientation === 'b' ? 7 - f : f;
    const rr = orientation === 'b' ? 7 - r : r;
    const x = GIF_BOARD_X + col * sq;
    const y = GIF_BOARD_Y + rr * sq;
    if (frame.check && frame.check.r === r && frame.check.f === f) {
      const g = ctx.createRadialGradient(x + sq / 2, y + sq / 2, 2, x + sq / 2, y + sq / 2, sq * 0.6);
      g.addColorStop(0, GIF_CHECK);
      g.addColorStop(1, 'rgba(214, 64, 52, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, sq, sq);
    }
    ctx.drawImage(images[p.color + p.type.toUpperCase()], x, y, sq, sq);
  }));

  // Подвал: последний ход или итог партии
  const footY = GIF_BOARD_Y + GIF_BOARD + 46;
  if (final) {
    const bandH = 120;
    const bandY = GIF_BOARD_Y + (GIF_BOARD - bandH) / 2;
    ctx.fillStyle = 'rgba(16, 14, 11, 0.82)';
    ctx.fillRect(GIF_BOARD_X, bandY, GIF_BOARD, bandH);
    ctx.fillStyle = textColor;
    fitFont(ctx, final, 700, 46, display, GIF_BOARD - 40, 24);
    ctx.fillText(final, GIF_W / 2, bandY + 62);
    ctx.fillStyle = accent;
    ctx.font = `700 20px ${body}`;
    ctx.fillText(t('Сыграй сам → chesai.ru'), GIF_W / 2, bandY + 96);
  }
  ctx.fillStyle = final ? muted : accent;
  ctx.font = `700 24px ${body}`;
  ctx.fillText(final ? 'chesai.ru' : (frame.label || t('Партия начинается')), GIF_W / 2, footY);
}

const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));

async function buildGameGif(rec) {
  const frames = gifPositions(rec.pgn);
  if (frames.length < 2) throw new Error('нет ходов');
  const { GIFEncoder, quantize, applyPalette } = await loadGifenc();
  const display = cssVar('--font-display', 'Georgia, serif');
  const body = cssVar('--font-body', 'sans-serif');
  try {
    await Promise.all([document.fonts.load(`700 46px ${display}`), document.fonts.load(`700 24px ${body}`)]);
  } catch (e) { /* нарисуем запасными шрифтами */ }
  const images = {};
  await Promise.all(['w', 'b'].flatMap(c => ['P', 'N', 'B', 'R', 'Q', 'K'].map(async p => {
    images[c + p] = await loadImage(pieceThemeFn(c + p));
  })));

  const canvas = document.createElement('canvas');
  canvas.width = GIF_W;
  canvas.height = GIF_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const opts = {
    images, display, body,
    orientation: rec.player_color === 'b' ? 'b' : 'w',
    names: gameSideNames(rec),
    accent: cssVar('--accent', '#AD8A4E'),
    total: frames.length - 1,
  };
  const finalTitle = describeResultForShare(rec).title;
  const render = (i, final = '') => {
    drawGifFrame(ctx, frames[i], { ...opts, index: i, final });
    return ctx.getImageData(0, 0, GIF_W, GIF_H).data;
  };

  // Палитра по трём кадрам: начало, середина и финал с плашкой итога
  const samples = [render(0), render(Math.floor(frames.length / 2)), render(frames.length - 1, finalTitle)];
  const sample = new Uint8ClampedArray(samples.reduce((n, s) => n + s.length, 0));
  samples.reduce((offset, s) => { sample.set(s, offset); return offset + s.length; }, 0);
  const palette = quantize(sample, 255);
  const transparentIndex = palette.length;
  palette.push([0, 0, 0]);

  const moveMs = clamp(Math.round(GIF_TOTAL_MS / (frames.length - 1)), GIF_MOVE_MS[0], GIF_MOVE_MS[1]);
  const gif = GIFEncoder();
  let prev = null;
  const writeFrame = (data, delay) => {
    const index = applyPalette(data, palette);
    if (!prev) {
      gif.writeFrame(index, GIF_W, GIF_H, { palette, delay, repeat: 0 });
    } else {
      const diff = new Uint8Array(index.length);
      for (let p = 0; p < index.length; p++) diff[p] = index[p] === prev[p] ? transparentIndex : index[p];
      gif.writeFrame(diff, GIF_W, GIF_H, { delay, transparent: true, transparentIndex, dispose: 1 });
    }
    prev = index;
  };
  for (let i = 0; i < frames.length; i++) {
    writeFrame(render(i), i === 0 ? GIF_START_MS : moveMs);
    if (i % 4 === 3) await nextTick(); // не замораживаем интерфейс
  }
  writeFrame(render(frames.length - 1, finalTitle), GIF_END_MS);
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}

let resultGifCache = null;

$id('resultGifBtn').addEventListener('click', async () => {
  const rec = lastGameRecord;
  if (!rec) return;
  playSound('ui');
  if (!rec.moves) { showToast(t('В партии не было ходов — показывать нечего')); return; }
  const btn = $id('resultGifBtn');
  setBusy(btn, true);
  try {
    if (!resultGifCache || resultGifCache.rec !== rec) {
      showToast(t('Собираем гифку с партией…'));
      resultGifCache = { rec, blob: await buildGameGif(rec) };
    }
    const { blob } = resultGifCache;
    const file = new File([blob], 'chesai-partiya.gif', { type: 'image/gif' });
    const { text } = describeResultForShare(rec);
    const outcome = navigator.canShare?.({ files: [file] })
      ? await shareOrCopy({ title: 'chesai', text, url: SHARE_BASE_URL, files: [file] })
      : 'download';
    if (outcome === 'blocked') {
      showToast(t('Гифка готова — нажмите ещё раз'));
    } else if (outcome === 'download' || outcome === 'copied' || outcome === 'failed') {
      downloadBlob(blob, 'chesai-partiya.gif');
      showToast(t('Гифка с партией сохранена'));
    }
    if (outcome !== 'cancelled' && outcome !== 'blocked') trackGoal('result_gif', { via: outcome, mode: rec.mode });
  } catch (e) {
    console.error('Не удалось собрать GIF:', e);
    showToast(t('Не удалось собрать гифку'));
  } finally {
    setBusy(btn, false);
  }
});
// Внутри VK файл не скачать, а в историю уходит только картинка — кнопку прячем
if (IS_VK) $id('resultGifBtn').classList.add('hidden');
