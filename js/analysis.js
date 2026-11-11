// Детали хода (мини-доска) и разбор партии.
'use strict';

/* =========================================================================
   ЗАГРУЗЧИК С КОНЁМ
   Конь прыгает внутри кольца. Без процента кольцо крутится, с процентом —
   заполняется по ходу работы (разбор партии).
   ========================================================================= */
const KNIGHT_SRC_BY_ACCENT = {
  gold: 'assests/knight.webp',
  maroon: 'assests/knight-red.webp',
  blue: 'assests/knight-blue.webp',
  green: 'assests/knight-green.webp',
};
const KNIGHT_RING_LENGTH = 2 * Math.PI * 28;

function knightLoaderHtml(text, { determinate = false } = {}) {
  const src = KNIGHT_SRC_BY_ACCENT[document.documentElement.dataset.accent] || KNIGHT_SRC_BY_ACCENT.gold;
  return `<div class="knight-loader${determinate ? ' is-determinate' : ''}" role="status">
    <div class="knight-loader-stage">
      <svg class="knight-loader-ring" viewBox="0 0 64 64" aria-hidden="true">
        <circle class="knight-loader-track" cx="32" cy="32" r="28"></circle>
        <circle class="knight-loader-arc" cx="32" cy="32" r="28"
          style="stroke-dasharray:${KNIGHT_RING_LENGTH.toFixed(1)};stroke-dashoffset:${determinate ? KNIGHT_RING_LENGTH.toFixed(1) : (KNIGHT_RING_LENGTH * 0.72).toFixed(1)}"></circle>
      </svg>
      <img class="knight-loader-img" src="${src}" alt="">
      <span class="knight-loader-shadow" aria-hidden="true"></span>
    </div>
    <div class="knight-loader-text">${escapeHtml(text)}</div>
  </div>`;
}
function setKnightLoaderProgress(root, percent, text) {
  const arc = root.querySelector('.knight-loader-arc');
  if (arc) arc.style.strokeDashoffset = (KNIGHT_RING_LENGTH * (1 - clamp(percent, 0, 100) / 100)).toFixed(1);
  const label = root.querySelector('.knight-loader-text');
  if (label && text != null) label.textContent = text;
}

/* =========================================================================
   ОЦЕНКА ОДНОГО ХОДА
   Общая для разбора партии и для окна «Анализ хода» (в т.ч. по клику на
   ход в списке ходов, когда разбора ещё не было).
   ========================================================================= */
// Пороги качества хода — по падению шансов на победу (как на lichess), а не по
// сырым сантипешкам: «+12 → +9» ничего не меняет, а «+1 → −2» — серьёзная ошибка.
const WIN_DROP_INACCURACY = 10;
const WIN_DROP_MISTAKE = 20;
const WIN_DROP_BLUNDER = 30;
// Ход несёт информацию об уровне, только пока партия не решена: в позиции
// «+10» любой ход «точный» и ничего не говорит о силе игрока.
const DECIDED_EVAL = 700;
// Первые ходы почти всегда «как по книге» — лучшим ходом партии их не считаем.
const OPENING_PLIES = 12;

function classifyWinDrop(drop) {
  if (drop >= WIN_DROP_BLUNDER) return 'blunder';
  if (drop >= WIN_DROP_MISTAKE) return 'mistake';
  if (drop >= WIN_DROP_INACCURACY) return 'inaccuracy';
  return 'ok';
}
function moveAccuracyFromWinDrop(drop) {
  return clamp(103.1668 * Math.exp(-0.04354 * Math.max(0, drop)) - 3.1669, 0, 100);
}

// before/after — записи анализа (score относительно стороны, чей ход в FEN).
function buildMoveItem(move, ply, fenBefore, fenAfter, before, after) {
  const whiteBefore = scoreAbsoluteWhite(before, fenBefore);
  const whiteAfter = scoreAbsoluteWhite(after, fenAfter);
  const sign = move.color === 'w' ? 1 : -1;
  const capBefore = whiteBefore == null ? null : cappedCp(whiteBefore) * sign;
  const capAfter = whiteAfter == null ? null : cappedCp(whiteAfter) * sign;
  const known = capBefore != null && capAfter != null;
  const loss = known ? Math.max(0, capBefore - capAfter) : 0;
  const winBefore = capBefore != null ? winChance(capBefore) : null;
  const winAfter = capAfter != null ? winChance(capAfter) : null;
  const winDrop = known ? Math.max(0, winBefore - winAfter) : 0;
  const classification = known ? classifyWinDrop(winDrop) : 'ok';
  return {
    move, ply, fenBefore, fenAfter,
    bestMove: before && before.bestMove || null,
    playedMove: move.san,
    evalWhiteBefore: whiteBefore, // как есть, с матами — для подписи «мат в N»
    evalWhiteAfter: whiteAfter,
    evalBefore: capBefore, // с точки зрения ходившего, обрезано до ±10 пешек
    evalAfter: capAfter,
    winBefore, winAfter, winDrop,
    accuracy: known ? moveAccuracyFromWinDrop(winDrop) : null,
    depth: before && before.depth || 0,
    pv: before && before.pv || null,
    loss,
    delta: move.color === 'w' ? -loss : loss, // сохранено для обратной совместимости (achievements.js)
    classification,
    critical: classification === 'mistake' || classification === 'blunder',
    informative: known && (Math.abs(capBefore) < DECIDED_EVAL || Math.abs(capAfter) < DECIDED_EVAL),
  };
}

const MOVE_CLASS_LABELS = {
  best: 'Лучший ход',
  ok: 'Хороший ход',
  inaccuracy: 'Неточность',
  mistake: 'Ошибка',
  blunder: 'Зевок',
};
function moveVerdict(item) {
  if (!item || item.evalBefore == null || item.evalAfter == null) return null;
  const isEngineBest = item.bestMove && item.move && (item.move.from + item.move.to) === item.bestMove.slice(0, 4);
  if (item.classification === 'ok' && (isEngineBest || item.loss <= 10)) return 'best';
  return item.classification;
}

// «+1.4», «−0.3», «мат в 3»
function formatEval(whiteScore) {
  if (whiteScore == null) return '—';
  if (Math.abs(whiteScore) >= 90000) {
    const n = 100000 - Math.abs(whiteScore);
    const side = whiteScore > 0 ? t('белым') : t('чёрным');
    return n <= 0 ? t('мат') : t('мат {side} в {n}', { side, n });
  }
  const pawns = whiteScore / 100;
  if (Math.abs(pawns) < 0.05) return '0.0';
  return `${pawns > 0 ? '+' : '−'}${Math.abs(pawns).toFixed(1)}`;
}
function moveNumberLabel(item) {
  const fullMove = parseInt((item.fenBefore || '').split(' ')[5], 10) || Math.floor(item.ply / 2) + 1;
  return item.move.color === 'w' ? `${fullMove}.` : `${fullMove}…`;
}
function uciToSan(fen, uci) {
  if (!uci) return null;
  try {
    const g = new Chess(fen);
    const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length === 5 ? uci[4] : 'q' });
    return mv ? mv.san : uci;
  } catch (e) { return uci; }
}

/* =========================================================================
   СТРЕЛКИ НА МИНИ-ДОСКЕ
   Толстая полупрозрачная стрелка с широким наконечником; ход коня рисуется
   уголком, как его и видит глаз. Вся стрелка — одна группа с общей
   прозрачностью, поэтому стык стержня и наконечника не темнеет.
   ========================================================================= */
const SVG_NS = 'http://www.w3.org/2000/svg';
const ARROW_COLORS = {
  best: '#5CB87A',
  ok: '#7FB2E5',
  inaccuracy: '#E3B341',
  mistake: '#E8873A',
  blunder: '#E05555',
  engine: '#5CB87A',
  neutral: 'var(--gold)',
};

function squareCenter(sq, flipped) {
  const file = 'abcdefgh'.indexOf(sq[0]);
  const rank = parseInt(sq[1], 10) - 1;
  const x = (file + 0.5) * 12.5;
  const y = (7 - rank + 0.5) * 12.5;
  return flipped ? { x: 100 - x, y: 100 - y } : { x, y };
}

function drawBoardArrow(svg, from, to, color, { flipped = false, opacity = 0.9, width = 1.9, dashed = false } = {}) {
  const a = squareCenter(from, flipped);
  const b = squareCenter(to, flipped);
  const df = Math.abs('abcdefgh'.indexOf(from[0]) - 'abcdefgh'.indexOf(to[0]));
  const dr = Math.abs(parseInt(from[1], 10) - parseInt(to[1], 10));
  const isKnightJump = (df === 1 && dr === 2) || (df === 2 && dr === 1);
  // Уголок коня: сначала на две клетки, потом на одну
  const points = [a];
  if (isKnightJump) points.push(dr === 2 ? { x: a.x, y: b.y } : { x: b.x, y: a.y });

  const prev = points[points.length - 1];
  const len = Math.hypot(b.x - prev.x, b.y - prev.y) || 1;
  const ux = (b.x - prev.x) / len;
  const uy = (b.y - prev.y) / len;
  const headLen = 4.4;
  const headHalf = 2.9;
  const tip = { x: b.x + ux * 1.6, y: b.y + uy * 1.6 };
  const base = { x: tip.x - ux * headLen, y: tip.y - uy * headLen };
  points.push({ x: base.x + ux * 0.6, y: base.y + uy * 0.6 }); // стержень заходит под наконечник

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'board-arrow');
  g.setAttribute('opacity', String(opacity));
  g.style.color = color;

  const shaft = document.createElementNS(SVG_NS, 'polyline');
  shaft.setAttribute('points', points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '));
  shaft.setAttribute('fill', 'none');
  shaft.setAttribute('stroke', 'currentColor');
  shaft.setAttribute('stroke-width', String(width));
  shaft.setAttribute('stroke-linecap', 'round');
  shaft.setAttribute('stroke-linejoin', 'round');
  if (dashed) shaft.setAttribute('stroke-dasharray', '2.6 2');
  g.appendChild(shaft);

  const head = document.createElementNS(SVG_NS, 'polygon');
  const px = -uy;
  const py = ux;
  head.setAttribute('points', [
    `${tip.x.toFixed(2)},${tip.y.toFixed(2)}`,
    `${(base.x + px * headHalf).toFixed(2)},${(base.y + py * headHalf).toFixed(2)}`,
    `${(base.x - px * headHalf).toFixed(2)},${(base.y - py * headHalf).toFixed(2)}`,
  ].join(' '));
  head.setAttribute('fill', 'currentColor');
  head.setAttribute('stroke', 'currentColor');
  head.setAttribute('stroke-width', '0.8');
  head.setAttribute('stroke-linejoin', 'round');
  g.appendChild(head);

  svg.appendChild(g);
}

function highlightDetailSquares(from, to, verdict) {
  document.querySelectorAll('#moveDetailBoard [data-square]').forEach((el) => {
    el.classList.remove('md-sq-from', 'md-sq-to');
    el.removeAttribute('data-verdict');
  });
  const fromEl = document.querySelector(`#moveDetailBoard [data-square="${from}"]`);
  const toEl = document.querySelector(`#moveDetailBoard [data-square="${to}"]`);
  if (fromEl) fromEl.classList.add('md-sq-from');
  if (toEl) { toEl.classList.add('md-sq-to'); if (verdict) toEl.dataset.verdict = verdict; }
}

/* =========================================================================
   ОКНО «АНАЛИЗ ХОДА»
   ========================================================================= */
let moveDetailBoard = null;
let moveDetailToken = 0;
let moveDetailItem = null; // оценка хода, открытого сейчас (null — ещё считается)
// Разбор последней партии: окно хода берёт отсюда готовые оценки, а не
// пересчитывает их заново.
let lastMoveAnalysis = [];

function renderMoveDetailFacts(item) {
  const factsEl = $id('moveDetailFacts');
  const verdict = moveVerdict(item);
  if (!verdict) { factsEl.innerHTML = ''; return; }
  const bestSan = uciToSan(item.fenBefore, item.bestMove);
  const winB = Math.round(item.winBefore);
  const winA = Math.round(item.winAfter);
  const winDelta = winA - winB;
  const lossPawns = (item.loss / 100).toFixed(1);
  const accuracy = Math.round(item.accuracy);
  const isEngineBest = verdict === 'best' && bestSan === item.move.san;

  const verdictNote = {
    best: isEngineBest ? t('Совпадает с первой линией Stockfish') : t('Почти не уступает лучшему ходу'),
    ok: t('Позиция сохранена, есть ход чуть точнее'),
    inaccuracy: t('Небольшая потеря, позиция ещё держится'),
    mistake: t('Заметно ухудшает позицию'),
    blunder: t('Резко меняет оценку партии'),
  }[verdict];

  factsEl.innerHTML = `
    <div class="md-verdict" data-verdict="${verdict}">
      <span class="md-verdict-dot" aria-hidden="true"></span>
      <div class="md-verdict-text">
        <b>${t(MOVE_CLASS_LABELS[verdict])}</b>
        <span>${escapeHtml(verdictNote)}</span>
      </div>
      <div class="md-verdict-score" title="${escapeHtml(t('Точность хода'))}"><b>${accuracy}%</b><span>${t('точность')}</span></div>
    </div>

    <div class="md-win">
      <div class="md-win-head">
        <span>${t('Шансы на победу у {side}', { side: item.move.color === 'w' ? t('белых') : t('чёрных') })}</span>
        <b>${winB}% → ${winA}% <em class="${winDelta < 0 ? 'is-down' : 'is-up'}">${winDelta > 0 ? '+' : winDelta < 0 ? '−' : '±'}${Math.abs(winDelta)}</em></b>
      </div>
      <div class="md-win-track">
        <span class="md-win-fill" style="width:${winA}%"></span>
        <span class="md-win-marker" style="left:${winB}%" title="${escapeHtml(t('до хода'))}"></span>
      </div>
    </div>

    <div class="md-tiles">
      <div class="md-tile"><span>${t('Оценка')}</span><b>${formatEval(item.evalWhiteBefore)} → ${formatEval(item.evalWhiteAfter)}</b></div>
      <div class="md-tile"><span>${t('Потеря')}</span><b>${item.loss < 5 ? t('нет') : t('{n} пешки', { n: lossPawns })}</b></div>
      <div class="md-tile md-tile-best"><span>${t('Лучший по Stockfish')}</span><b>${isEngineBest ? `${escapeHtml(item.move.san)} ✓` : escapeHtml(bestSan || '—')}</b></div>
    </div>`;
}

// chessboard.js округляет размер доски до кратного 8 пикселей, поэтому слой
// со стрелками подгоняем ровно под саму доску, а не под её контейнер.
function alignArrowLayer() {
  const svg = $id('moveDetailArrow');
  const boardEl = document.querySelector('#moveDetailBoard .board-b72b1');
  const box = svg.parentElement;
  if (!boardEl || !box) return;
  const b = boardEl.getBoundingClientRect();
  const c = box.getBoundingClientRect();
  svg.style.left = `${b.left - c.left}px`;
  svg.style.top = `${b.top - c.top}px`;
  svg.style.width = `${b.width}px`;
  svg.style.height = `${b.height}px`;
}

function drawMoveDetailArrows(item, playedMove) {
  const svg = $id('moveDetailArrow');
  svg.innerHTML = '';
  alignArrowLayer();
  const legend = $id('moveDetailLegend');
  const verdict = moveVerdict(item);
  const playedColor = verdict ? ARROW_COLORS[verdict] : ARROW_COLORS.neutral;
  const bestUci = item && item.bestMove;
  const sameAsBest = bestUci && playedMove && bestUci.slice(0, 4) === playedMove.from + playedMove.to;

  if (bestUci && !sameAsBest) {
    drawBoardArrow(svg, bestUci.slice(0, 2), bestUci.slice(2, 4), ARROW_COLORS.engine, { opacity: 0.85, width: 1.6, dashed: true });
  }
  if (playedMove) drawBoardArrow(svg, playedMove.from, playedMove.to, playedColor);
  if (playedMove) highlightDetailSquares(playedMove.from, playedMove.to, verdict);

  const rows = [];
  if (playedMove) rows.push(`<span class="md-legend-item"><i style="background:${playedColor}"></i>${t('Сыгранный ход')}</span>`);
  if (bestUci && !sameAsBest) rows.push(`<span class="md-legend-item"><i class="is-dashed" style="background:${ARROW_COLORS.engine}"></i>${t('Лучший ход')}</span>`);
  legend.innerHTML = rows.join('');
}

async function openMoveDetail(fenBefore, san, label = null) {
  const token = ++moveDetailToken;
  moveDetailItem = null;
  const modal = $id('moveDetailModal');
  const badgeEl = $id('moveDetailBadge');
  const sanEl = $id('moveDetailSan');
  const commentEl = $id('moveDetailComment');
  const loadingEl = $id('moveDetailLoading');
  const factsEl = $id('moveDetailFacts');

  $id('moveDetailTitle').textContent = t('Анализ хода');
  commentEl.innerHTML = '';
  commentEl.classList.add('hidden');
  factsEl.innerHTML = '';
  $id('moveDetailArrow').innerHTML = '';
  $id('moveDetailLegend').innerHTML = '';
  loadingEl.innerHTML = knightLoaderHtml(t('Stockfish изучает позицию…'));
  loadingEl.classList.remove('hidden');
  modal.classList.remove('hidden');

  badgeEl.className = 'move-detail-badge';
  const isFriend = state.mode === 'friend';
  if (label === 'best') {
    badgeEl.innerHTML = achievementIconSvg('circle-check') + (isFriend ? t('Лучший ход партии') : t('Ваш лучший ход'));
    badgeEl.classList.add('is-visible', 'is-best');
  } else if (label === 'worst') {
    badgeEl.innerHTML = achievementIconSvg('circle-x') + (isFriend ? t('Худший ход партии') : t('Ваша главная ошибка'));
    badgeEl.classList.add('is-visible', 'is-worst');
  }

  const tempGame = new Chess(fenBefore);
  const playedMove = tempGame.move(san);
  const fenAfter = playedMove ? tempGame.fen() : null;
  const ply = state.fenHistory.indexOf(fenBefore);

  const sideText = fenBefore.split(' ')[1] === 'w' ? t('ход белых') : t('ход чёрных');
  const fullMove = parseInt(fenBefore.split(' ')[5], 10) || 1;
  sanEl.innerHTML = `<b>${fullMove}${fenBefore.split(' ')[1] === 'w' ? '.' : '…'} ${escapeHtml(san)}</b><span>${sideText}</span>`;

  // Позиция ДО хода: на ней видно и сыгранный ход, и то, что было лучше
  if (!moveDetailBoard) {
    moveDetailBoard = Chessboard('moveDetailBoard', {
      position: fenBefore,
      draggable: false,
      pieceTheme: pieceThemeFn,
      showNotation: true,
    });
    window.addEventListener('resize', () => {
      if (!moveDetailBoard) return;
      moveDetailBoard.resize();
      alignArrowLayer();
      // resize() перерисовывает клетки — возвращаем подсветку хода
      const mv = moveDetailItem && moveDetailItem.move;
      if (mv) highlightDetailSquares(mv.from, mv.to, moveVerdict(moveDetailItem));
    });
  } else {
    moveDetailBoard.position(fenBefore, false);
  }
  requestAnimationFrame(() => {
    if (token !== moveDetailToken || !moveDetailBoard) return;
    moveDetailBoard.resize();
    moveDetailBoard.position(fenBefore, false);
    if (playedMove) drawMoveDetailArrows(moveDetailItem, playedMove);
  });
  if (!playedMove) {
    console.warn('Не удалось выполнить ход из SAN:', san);
    loadingEl.classList.add('hidden');
    return;
  }

  try {
    let item = lastMoveAnalysis.find(m => m.fenBefore === fenBefore && m.move.san === san) || null;
    if (!item || !item.bestMove || item.evalBefore == null) {
      const before = await analyzePosition(fenBefore, { movetime: 600 });
      const after = await analyzePosition(fenAfter, { movetime: 500 });
      item = buildMoveItem(playedMove, ply >= 0 ? ply : 0, fenBefore, fenAfter, before, after);
    }
    if (token !== moveDetailToken) return;

    moveDetailItem = item;
    renderMoveDetailFacts(item);
    drawMoveDetailArrows(item, playedMove);

    const bestSan = uciToSan(fenBefore, item.bestMove);
    if (!chatSignedIn) {
      loadingEl.classList.add('hidden');
      commentEl.textContent = t('Объяснение от нейросети доступно после входа в аккаунт.');
      commentEl.classList.remove('hidden');
      return;
    }

    setKnightLoaderProgress(loadingEl, 0, t('Нейросеть объясняет ход…'));
    const verdict = moveVerdict(item);
    const prompt = `
Позиция до хода (FEN): ${fenBefore}
Ходили: ${playedMove.color === 'w' ? 'белые' : 'чёрные'}. Сыгранный ход: ${san}.
Лучший ход по Stockfish: ${bestSan || 'неизвестно'}.
Оценка до хода: ${formatEval(item.evalWhiteBefore)}, после хода: ${formatEval(item.evalWhiteAfter)} (в пешках, плюс — перевес белых).
Шансы ходившей стороны на победу: ${Math.round(item.winBefore)}% → ${Math.round(item.winAfter)}%.
Категория хода по Stockfish: ${MOVE_CLASS_LABELS[verdict] || 'неизвестно'}.

Объясни человеческим языком, почему ход ${san} получил такую оценку: что он делает, какие угрозы создаёт или пропускает${bestSan && bestSan !== san ? `, и чем лучше ${bestSan}` : ''}. Не называй других «лучших ходов», кроме хода Stockfish. 2-3 предложения ${AI_LANGUAGE}, простым текстом, без markdown.
`;
    const reply = await provodChat([{ role: 'user', content: prompt }], { temperature: 0.4, fast: true });
    if (token !== moveDetailToken) return;
    commentEl.textContent = stripMarkdown(reply) || t('Не удалось получить комментарий.');
  } catch (error) {
    if (token !== moveDetailToken) return;
    commentEl.textContent = chatErrorMessage(error);
  } finally {
    if (token === moveDetailToken) {
      loadingEl.classList.add('hidden');
      if (commentEl.textContent) commentEl.classList.remove('hidden');
    }
  }
}

/* =========================================================================
   АНАЛИЗ ПАРТИИ
   ========================================================================= */
function startProgress() {
  const loadingEl = $id('analysisLoading');
  loadingEl.innerHTML = knightLoaderHtml(t('Подготовка анализа…'), { determinate: true });
}
function updateProgress(step, total, san) {
  const percent = Math.round((step / total) * 100);
  setKnightLoaderProgress($id('analysisLoading'), percent, san
    ? t('Проверка хода: {san} ({percent}%)', { san, percent })
    : t('Анализ начальной позиции… ({percent}%)', { percent }));
}
function stopProgress(success = true) {
  if (success) setKnightLoaderProgress($id('analysisLoading'), 100, t('Готово'));
}

function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

// Насколько заранее известна сила стороны: у персонажа — его заявленный
// рейтинг, у Stockfish — рейтинг выбранного уровня. У игрока — неизвестна.
function knownSideElo(color) {
  if (state.mode === 'friend' || color === state.playerColor) return null;
  if (state.mode === 'characters' && state.character) return state.character.elo;
  if (state.mode === 'ai') return skillLevelToElo(state.skillLevel);
  return null;
}

// Уровень игры в этой партии. Считаем только по ходам, сделанным, пока
// партия не была решена. Если таких ходов мало, у соперника с известной
// силой оценка подтягивается к его рейтингу: одна короткая партия против
// зевающего игрока не превращает новичка в гроссмейстера.
const ELO_MIN_MOVES = 3;
const ELO_MIN_RATED_MOVES = 10; // столько ходов игрока нужно, чтобы партия изменила рейтинг аккаунта
const ELO_PRIOR_WEIGHT = 6;
function estimateSideElo(items, prior) {
  const informative = items.filter(m => m.informative);
  const n = informative.length;
  if (n < ELO_MIN_MOVES) return { elo: prior, raw: null, moves: n };
  const raw = eloFromAvgCpl(avg(informative.map(m => m.loss)));
  const elo = prior == null ? raw : Math.round((raw * n + prior * ELO_PRIOR_WEIGHT) / (n + ELO_PRIOR_WEIGHT));
  return { elo, raw, moves: n };
}

// Сила игрока заранее не известна, но рейтинг аккаунта — лучшая догадка.
// Без неё пять точных дебютных ходов давали «уровень ~2300», и рейтинг
// прыгал на сотни очков даже за сданную партию.
function playerRatingAnchor(color) {
  if (state.mode === 'friend' || color !== state.playerColor) return null;
  const acc = typeof getAccount === 'function' ? getAccount() : null;
  return acc && Number.isFinite(acc.elo) ? acc.elo : null;
}

function sideStats(items, color) {
  const own = items.filter(m => m.move.color === color);
  const scored = own.filter(m => m.accuracy != null);
  const count = (cls) => own.filter(m => m.classification === cls).length;
  const prior = knownSideElo(color);
  const est = estimateSideElo(own, prior ?? playerRatingAnchor(color));
  return {
    moves: own.length,
    accuracy: scored.length ? avg(scored.map(m => m.accuracy)) : 0,
    avgCpl: avg(own.map(m => m.loss)),
    inaccuracies: count('inaccuracy'),
    mistakes: count('mistake'),
    blunders: count('blunder'),
    elo: est.elo,
    eloMoves: est.moves,
    knownElo: prior,
  };
}

// Ход, которым стоит гордиться: после дебюта, точный и заметно улучшивший
// положение (обычно — наказание за ошибку соперника).
function pickBestMove(items) {
  const pool = items.filter(m => m.ply >= OPENING_PLIES && m.classification === 'ok' && m.loss <= 25 && m.winAfter != null);
  if (!pool.length) return null;
  let best = null;
  let bestValue = -Infinity;
  for (const m of pool) {
    const prevOwn = items.find(p => p.ply === m.ply - 2);
    const swing = prevOwn && prevOwn.winAfter != null ? m.winAfter - prevOwn.winAfter : 0;
    const flags = m.move.flags || '';
    const value = swing + (flags.includes('c') ? 3 : 0) + (m.move.san.includes('+') ? 2 : 0) - m.loss * 0.05;
    if (value > bestValue) { bestValue = value; best = m; }
  }
  return best;
}
function pickWorstMove(items) {
  let worst = null;
  for (const m of items) {
    if (m.classification === 'ok') continue; // хороший ход ошибкой не называем
    if (!worst || m.winDrop > worst.winDrop || (m.winDrop === worst.winDrop && m.loss > worst.loss)) worst = m;
  }
  return worst;
}

// Считает moveAnalysis + агрегированную статистику (Accuracy/CPL/Elo/…) по
// уже имеющемуся набору evaluations. Чистая функция без обращений к
// Stockfish — используется и для быстрого предварительного прохода, и для
// уточнённого результата после фонового доуглубления (ТЗ п.2).
function computeGameStats(fens, moves, evaluations) {
  const moveAnalysis = [];
  for (let j = 0; j < moves.length; j++) {
    if (!evaluations[j]) continue;
    moveAnalysis.push(buildMoveItem(moves[j], j, fens[j], fens[j + 1], evaluations[j], evaluations[j + 1]));
  }
  const white = sideStats(moveAnalysis, 'w');
  const black = sideStats(moveAnalysis, 'b');

  // Лучший и худший ход — ходы игрока (в игре вдвоём — любой стороны)
  const mine = state.mode === 'friend' ? moveAnalysis : moveAnalysis.filter(m => m.move.color === state.playerColor);

  return {
    moveAnalysis, white, black,
    accuracyWhite: white.accuracy, accuracyBlack: black.accuracy,
    avgCplWhite: white.avgCpl, avgCplBlack: black.avgCpl,
    eloWhite: white.elo, eloBlack: black.elo,
    statsWhite: white, statsBlack: black,
    bestMoveObj: pickBestMove(mine),
    worstMoveObj: pickWorstMove(mine),
  };
}

// Счётчик запусков Review Analysis — если пользователь запустил новый анализ
// (или он же — «Обновить анализ») пока предыдущий ещё фоново уточнялся,
// старое фоновое уточнение узнаёт об этом (runId !== analysisRunId) и
// прекращает себя, не затирая уже более новый результат.
let analysisRunId = 0;

async function requestAnalysis() {
  const btn = $id('requestAnalysisBtn');
  const loading = $id('analysisLoading');
  const content = $id('analysisContent');
  const block = $id('analysisBlock');

  block.classList.remove('hidden');
  loading.classList.remove('hidden');
  content.innerHTML = '';
  btn.disabled = true;
  trackGoal('analysis_request');

  startProgress();

  const runId = ++analysisRunId;

  try {
    const fens = state.fenHistory;
    const moves = state.game.history({ verbose: true });
    if (fens.length < 2) throw new Error(t('Недостаточно ходов для анализа.'));

    await waitForEngine(3000);
    if (!isEngineReady) throw new Error(t('Движок Stockfish не готов. Обновите страницу и попробуйте снова.'));

    // Если последняя позиция партии всё ещё анализируется в фоне (Infinite
    // Analysis) — останавливаем и сохраняем в кэш то, что уже накоплено.
    await stopBackgroundAnalysis();

    const weakPc = state.settings.analysisMode === 'weak';
    const baseDepth = weakPc ? ANALYSIS_TARGET.weakReviewBaseDepth : ANALYSIS_TARGET.reviewBaseDepth;
    const criticalDepth = weakPc ? ANALYSIS_TARGET.weakReviewCriticalDepth : ANALYSIS_TARGET.reviewCriticalDepth;

    // ФАЗА 1 (быстрая, ТЗ п.2): берём то, что уже накоплено в общем кэше
    // (в т.ч. из Live Analysis во время партии), и только для полностью
    // непроанализированных позиций делаем короткий разовый скан.
    const total = fens.length;
    const prelimEvaluations = [];
    for (let i = 0; i < fens.length; i++) {
      const result = analysisCache.get(fens[i]) || await analyzePosition(fens[i], { movetime: 250 });
      prelimEvaluations.push(result);
      updateProgress(i + 1, total, moves[i] ? moves[i].san : null);
    }

    const prelimStats = computeGameStats(fens, moves, prelimEvaluations);
    stopProgress(true);
    renderAnalysis(prelimStats, moves.length, t('Уточняю анализ партии в фоне…'), { refining: true });
    hideConnectionBanner();

    // ФАЗА 2 (фоновая, ТЗ п.2): доуглубляем и пересчитываем, не блокируя окно.
    refineGameAnalysis(runId, fens, moves, weakPc, baseDepth, criticalDepth);
  } catch (error) {
    console.error('Ошибка анализа:', error);
    content.innerHTML = `<p class="analysis-error">${t('Не удалось получить анализ.')} ${escapeHtml(error.message)}</p>`;
    showConnectionBanner(t('Ошибка: {error}', { error: error.message }));
  } finally {
    loading.classList.add('hidden');
    btn.disabled = false;
    btn.textContent = t('Обновить анализ');
  }
}

// Фоновое углубление уже показанного предварительного результата (ТЗ п.2).
async function refineGameAnalysis(runId, fens, moves, weakPc, baseDepth, criticalDepth) {
  try {
    while (analysisQueue.length) {
      if (runId !== analysisRunId) return;
      await processAnalysisQueueOnce();
    }
    if (runId !== analysisRunId) return;

    const evaluations = [];
    for (let i = 0; i < fens.length; i++) {
      if (runId !== analysisRunId) return;
      const result = await analyzePosition(fens[i], { minDepth: baseDepth });
      evaluations.push(result);
    }
    if (runId !== analysisRunId) return;

    let stats = computeGameStats(fens, moves, evaluations);

    // Критические ходы (ТЗ п.5/11): позицию ДО хода — глубже и с MultiPV.
    const criticalItems = stats.moveAnalysis.filter(m => m.critical).sort((a, b) => b.winDrop - a.winDrop).slice(0, weakPc ? 3 : 8);
    for (const item of criticalItems) {
      if (runId !== analysisRunId) return;
      try {
        const deep = await analyzePosition(item.fenBefore, { minDepth: criticalDepth });
        if (deep) { item.depth = deep.depth; item.bestMove = deep.bestMove; item.pv = deep.pv; }
        const candidates = await searchTopMoves(item.fenBefore, { movetime: weakPc ? 500 : 900, multipv: weakPc ? 2 : 3 });
        item.alternatives = describeCandidateMoves(item.fenBefore, candidates);
      } catch (e) { /* если доанализ не удался — оставляем базовый результат */ }
    }
    if (runId !== analysisRunId) return;

    stats = computeGameStats(fens, moves, evaluations);
    stats.moveAnalysis.forEach((m) => {
      const refined = criticalItems.find(c => c.fenBefore === m.fenBefore && c.move.san === m.move.san);
      if (refined) { m.depth = refined.depth; m.bestMove = refined.bestMove; m.pv = refined.pv; m.alternatives = refined.alternatives; }
    });

    const pgn = state.game.pgn();
    let comment = chatSignedIn ? t('Комментарий недоступен.') : t('Комментарий нейросети к партии появится после входа в аккаунт.');
    if (chatSignedIn) try {
      const prompt = `Партия в шахматы (PGN): ${pgn}
Точность белых (расчёт движка): ${stats.accuracyWhite.toFixed(1)}%, средняя потеря centipawn: ${stats.avgCplWhite.toFixed(0)}.
Точность чёрных: ${stats.accuracyBlack.toFixed(1)}%, средняя потеря centipawn: ${stats.avgCplBlack.toFixed(0)}.
Лучший ход игрока: ${stats.bestMoveObj ? stats.bestMoveObj.move.san : '—'}.
Главная ошибка игрока: ${stats.worstMoveObj ? stats.worstMoveObj.move.san : '—'}.
Дай короткий (2-3 предложения) комментарий о партии ${AI_LANGUAGE} простым текстом, без markdown-разметки.`;
      const raw = await provodChat([{ role: 'user', content: prompt }], { temperature: 0.4, fast: true });
      comment = stripMarkdown(raw) || comment;
    } catch (e) {
      console.error('Ошибка комментария ИИ:', e);
    }

    if (runId !== analysisRunId) return; // пользователь успел запустить новый анализ — не затираем его результат

    renderAnalysis(stats, moves.length, comment);

    // Старая партия из «Моих партий»: разбор только для просмотра — иначе
    // повторные разборы двигали бы рейтинг и копили достижения за анализ.
    if (state.isReview) return;
    if (window.Achievements) {
      const evaluationsAbsoluteWhite = fens.map((fen, i) => scoreAbsoluteWhite(evaluations[i], fen));
      window.Achievements.trackAnalysis({
        accuracyWhite: stats.accuracyWhite, accuracyBlack: stats.accuracyBlack,
        eloWhite: stats.eloWhite, eloBlack: stats.eloBlack,
        moveAnalysis: stats.moveAnalysis, evaluationsAbsoluteWhite,
      });
    }
    // Рейтинг меняет только партия, где игрок сделал достаточно ходов до того,
    // как всё решилось: иначе сдача после дебюта поднимала рейтинг.
    const mine = state.playerColor === 'w' ? stats.white : stats.black;
    if (mine.eloMoves >= ELO_MIN_RATED_MOVES) updateAccountEloFromGame(mine.elo);
  } catch (error) {
    console.error('Ошибка фонового уточнения анализа:', error);
  }
}

function sideTitle(color) {
  if (state.mode === 'friend') return color === 'w' ? t('Белые') : t('Чёрные');
  if (color === state.playerColor) return t('Вы');
  if (state.mode === 'characters' && state.character) return state.character.name;
  if (state.mode === 'online') return state.onlineOpponentName || t('Соперник');
  return 'Stockfish';
}

function eloCell(side) {
  // По трём-пяти дебютным ходам «уровень ~1900» — шум: оценку показываем с того же
  // числа ходов, с которого партия влияет на рейтинг. У соперника с известной силой — его рейтинг.
  if (side.elo == null || side.eloMoves < ELO_MIN_RATED_MOVES) {
    if (side.knownElo != null) return `≈${side.knownElo}<small>${t('заявлено')}</small>`;
    return `<span class="muted">${t('мало ходов')}</span>`;
  }
  const known = side.knownElo != null ? `<small>${t('заявлено ≈{elo}', { elo: side.knownElo })}</small>` : '';
  return `~${side.elo}${known}`;
}

function moveCardHtml(kind, item) {
  const verdict = moveVerdict(item);
  const title = kind === 'best'
    ? (state.mode === 'friend' ? t('Лучший ход партии') : t('Ваш лучший ход'))
    : (state.mode === 'friend' ? t('Худший ход партии') : t('Ваша главная ошибка'));
  const winDelta = Math.round(item.winAfter - item.winBefore);
  const detail = kind === 'best'
    ? t('{label} · шансы {win}%', { label: t(MOVE_CLASS_LABELS[verdict] || 'Хороший ход'), win: Math.round(item.winAfter) })
    : t('{label} · шансы {delta}%', { label: t(MOVE_CLASS_LABELS[verdict] || 'Неточность'), delta: `${winDelta > 0 ? '+' : '−'}${Math.abs(winDelta)}` });
  return `<button type="button" class="move-card move-card-${kind}" data-fen="${escapeHtml(item.fenBefore)}" data-san="${escapeHtml(item.move.san)}">
    <span class="move-card-icon">${achievementIconSvg(kind === 'best' ? 'circle-check' : 'circle-x')}</span>
    <span class="move-card-text"><span>${title}</span><small>${escapeHtml(detail)}</small></span>
    <span class="move-card-san"><small>${moveNumberLabel(item)}</small>${escapeHtml(item.move.san)}</span>
  </button>`;
}

function renderAnalysis(stats, totalPly, comment, { refining = false } = {}) {
  lastMoveAnalysis = stats.moveAnalysis;
  const content = $id('analysisContent');
  const first = state.mode === 'friend' ? 'w' : state.playerColor;
  const second = first === 'w' ? 'b' : 'w';
  const side = { w: stats.white, b: stats.black };
  const A = side[first];
  const B = side[second];
  const triple = (s) => `<span class="ac-errors"><i class="is-inacc">${s.inaccuracies}</i><i class="is-mistake">${s.mistakes}</i><i class="is-blunder">${s.blunders}</i></span>`;

  let html = `<div class="analysis-compare">
    <div class="ac-row ac-head"><span>${Math.ceil(totalPly / 2)} ${plural(Math.ceil(totalPly / 2), 'ход', 'хода', 'ходов')}</span><b>${escapeHtml(sideTitle(first))}</b><b>${escapeHtml(sideTitle(second))}</b></div>
    <div class="ac-row"><span>${t('Точность')}</span><b>${A.accuracy.toFixed(0)}%</b><b>${B.accuracy.toFixed(0)}%</b></div>
    <div class="ac-row"><span>${t('Уровень игры')}</span><b>${eloCell(A)}</b><b>${eloCell(B)}</b></div>
    <div class="ac-row"><span title="${escapeHtml(t('Средняя потеря за ход, в сотых долях пешки (CPL)'))}">${t('Средняя потеря')}</span><b>${A.avgCpl.toFixed(0)}</b><b>${B.avgCpl.toFixed(0)}</b></div>
    <div class="ac-row"><span>${t('Неточности · ошибки · зевки')}</span><b>${triple(A)}</b><b>${triple(B)}</b></div>
  </div>`;

  if (stats.bestMoveObj || stats.worstMoveObj) {
    html += `<div class="move-cards">${stats.bestMoveObj ? moveCardHtml('best', stats.bestMoveObj) : ''}${stats.worstMoveObj ? moveCardHtml('worst', stats.worstMoveObj) : ''}</div>`;
  }

  html += `<p class="analysis-comment">${escapeHtml(comment)}</p>`;
  if (refining) {
    html += `<p class="analysis-disclaimer analysis-refining">${achievementIconSvg('hourglass')}${t('Быстрый предварительный результат — Stockfish продолжает углублять анализ в фоне, значения скоро уточнятся.')}</p>`;
  }
  html += `<p class="analysis-disclaimer">${t('Уровень считается только по ходам, сделанным до того, как партия была решена; у соперника с известной силой он учитывает и заявленный рейтинг. Это грубая оценка, не официальный рейтинг.')}</p>`;
  content.innerHTML = html;

  content.querySelectorAll('.move-card').forEach(card => {
    card.addEventListener('click', () => {
      const label = card.classList.contains('move-card-best') ? 'best'
        : card.classList.contains('move-card-worst') ? 'worst' : null;
      openMoveDetail(card.dataset.fen, card.dataset.san, label);
      if (label === 'best' && window.Achievements && !state.isReview) window.Achievements.trackBestMoveView();
    });
  });
}

$id('requestAnalysisBtn').addEventListener('click', requestAnalysis);
