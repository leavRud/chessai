// Ходы соперника: Stockfish и персонажи, их реакции и итоговая карточка партии.
'use strict';

/* =========================================================================
   ХОД НЕЙРОСЕТИ (STOCKFISH)
   ========================================================================= */
function pickFallbackMove() {
  const verboseMoves = state.game.moves({ verbose: true });
  const captures = verboseMoves.filter((m) => m.flags.includes('c') || m.flags.includes('e'));
  const pool = captures.length ? captures : verboseMoves;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return state.game.move({ from: chosen.from, to: chosen.to, promotion: 'q' });
}

function setThinkingUI(isThinking) {
  $id('thinkingIndicator').classList.toggle('hidden', !isThinking);
}

// Партию начали раньше, чем догрузился движок: вместо «Ход соперника» честно
// пишем, чего ждём. Следующий updateStatus() вернёт обычный текст.
function showEngineLoadingStatus() {
  if (!isEngineReady && isEngineLoading) $id('statusText').textContent = t('Загружаю движок…');
}

async function requestAiMove() {
  if (!state.game || state.isGameOver || state.game.turn() !== state.aiColor) return;
  state.isThinking = true;
  setThinkingUI(true);
  updateStatus();

  const fenForSearch = state.game.fen();
  const movetime = movetimeForSkill(state.skillLevel);
  showEngineLoadingStatus();
  await waitForEngine(3000);
  const moveUci = await searchBestMove(fenForSearch, { movetime });

  let moveObj = null;
  if (moveUci) {
    const from = moveUci.substring(0, 2);
    const to = moveUci.substring(2, 4);
    const promotion = moveUci.length === 5 ? moveUci[4] : 'q';
    moveObj = state.game.move({ from, to, promotion });
  }
  if (moveObj === null) {
    moveObj = pickFallbackMove();
  }
  if (moveObj) {
    state.fenHistory.push(state.game.fen());
    onMoveMade(moveObj, false);
  }
  state.isThinking = false;
  setThinkingUI(false);
  updateStatus();
}

/* =========================================================================
   ХОД ПЕРСОНАЖА (STOCKFISH + СТИЛЬ ЛИЧНОСТИ)
   Stockfish отвечает только за качество ходов. Нейросеть НЕ ищет ход сама —
   она лишь выбирает между несколькими примерно равноценными вариантами,
   которые предложил движок, ориентируясь на характер персонажа.
   ========================================================================= */
function applyUciMove(uci) {
  if (!uci) return null;
  const from = uci.substring(0, 2);
  const to = uci.substring(2, 4);
  const promotion = uci.length === 5 ? uci[4] : 'q';
  return state.game.move({ from, to, promotion });
}

async function searchTopMoves(fen, { movetime = 900, multipv = 3 } = {}) {
  // Освобождаем движок от фонового анализа ДО постановки задачи в очередь
  // (см. подробный комментарий в searchBestMove).
  await stopBackgroundAnalysis();
  return queueEngineTask(() => new Promise((resolve) => {
    if (!stockfish || !isEngineReady) { resolve([]); return; }
    let resolved = false;
    const lines = new Map();
    const finish = () => {
      if (resolved) return;
      resolved = true;
      stockfish.removeEventListener('message', handler);
      clearTimeout(timer);
      stockfish.postMessage('setoption name MultiPV value 1');
      const arr = Array.from(lines.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => v)
        .filter(v => v && v.move);
      resolve(arr);
    };
    const handler = (e) => {
      const msg = e.data;
      if (typeof msg !== 'string') return;
      if (msg.startsWith('info') && msg.indexOf(' pv ') !== -1) {
        const parts = msg.split(' ');
        const mpvIdx = parts.indexOf('multipv');
        const scoreIdx = parts.indexOf('score');
        const pvIdx = parts.indexOf('pv');
        if (mpvIdx !== -1 && scoreIdx !== -1 && pvIdx !== -1) {
          const n = parseInt(parts[mpvIdx + 1], 10);
          let score = null;
          if (parts[scoreIdx + 1] === 'cp') {
            score = parseInt(parts[scoreIdx + 2], 10);
          } else if (parts[scoreIdx + 1] === 'mate') {
            const mateIn = parseInt(parts[scoreIdx + 2], 10);
            score = mateIn > 0 ? 100000 - mateIn : -100000 - mateIn;
          }
          const move = parts[pvIdx + 1];
          if (Number.isFinite(n) && move && score !== null) lines.set(n, { move, score });
        }
      }
      if (msg.startsWith('bestmove')) finish();
    };
    const timer = setTimeout(finish, movetime + 4000);
    stockfish.addEventListener('message', handler);
    stockfish.postMessage('position fen ' + fen);
    stockfish.postMessage(`setoption name MultiPV value ${multipv}`);
    stockfish.postMessage(`go movetime ${movetime}`);
  }));
}

function describeCandidateMoves(fen, candidates) {
  return candidates.map((cand) => {
    const g2 = new Chess(fen);
    const from = cand.move.substring(0, 2);
    const to = cand.move.substring(2, 4);
    const promotion = cand.move.length === 5 ? cand.move[4] : 'q';
    const mv = g2.move({ from, to, promotion });
    if (!mv) return null;
    const tags = [];
    if (mv.flags.includes('c') || mv.flags.includes('e')) tags.push('взятие');
    if (g2.in_check()) tags.push('шах');
    if (mv.flags.includes('k') || mv.flags.includes('q')) tags.push('рокировка');
    if (mv.flags.includes('p')) tags.push('превращение');
    return { san: mv.san, uci: cand.move, score: cand.score, tags, isCapture: mv.flags.includes('c') || mv.flags.includes('e') };
  }).filter(Boolean);
}

const traitK = (v) => clamp(Number(v) || 0, 0, 100) / 100;

// Сила персонажа. Skill Level движка здесь не помогает: ходы персонажа берутся
// из строк MultiPV (честные оценки), а не из bestmove, который Stockfish
// намеренно портит на низком уровне. Поэтому слабость задаём сами:
//  - tolerance — на сколько сантипешек хуже лучшего хода персонаж готов сыграть;
//  - blunderChance — шанс «зевнуть»: на этом ходу коридор втрое шире;
//  - multipv — слабым показываем больше вариантов, сильным только лучшие.
// Осторожность сужает коридор и снижает шанс зевка, азарт — наоборот.
function characterMovePolicy(c) {
  const strength = clamp((Number(c.elo) - 500) / 2400, 0, 1); // 0 — новичок, 1 — гроссмейстер
  const caution = traitK(c.caution);
  const tolerance = (20 + (1 - strength) * 230) * (1.25 - 0.5 * caution); // 2900 → ~20, 1500 → ~115, 600 → ~240
  const blunderChance = (1 - strength) ** 2 * 0.3 * (1.3 - 0.6 * caution); // 600 Elo → ~25%, 1500 → ~10%, 2400 → ~1%
  const multipv = strength < 0.35 ? 5 : strength < 0.65 ? 4 : 3;
  return { strength, caution, tolerance, blunderChance, multipv };
}

// Выбор хода по характеру — локально, без нейросети (раньше каждый такой
// ход ждал ответа модели по несколько секунд). Из ходов в коридоре
// tolerance берём тот, что ближе персонажу: агрессивные тянутся к взятиям и
// шахам, любители жертв — к рискованным взятиям, осторожные — к рокировке и
// к лучшему ходу движка. Чем слабее персонаж, тем меньше его волнует
// потеря оценки и тем больше случайности; эмоциональность её усиливает.
function pickCharacterMove(fen, candidates) {
  const c = state.character;
  const policy = characterMovePolicy(c);
  const topScore = candidates[0].score;
  const width = policy.tolerance * (Math.random() < policy.blunderChance ? 3 : 1);
  const pool = candidates.filter(cd => topScore - cd.score <= width);
  if (pool.length <= 1) return candidates[0];
  const described = describeCandidateMoves(fen, pool);
  if (described.length === 0) return candidates[0];

  const lossWeight = (0.25 + 0.75 * policy.strength) * (0.6 + 0.8 * policy.caution);
  const noise = 40 * (0.3 + traitK(c.emotionality)) * (1.6 - policy.strength);
  let best = described[0];
  let bestValue = -Infinity;
  for (const d of described) {
    let value = -(topScore - d.score) * lossWeight;
    if (d.isCapture) value += 25 * traitK(c.aggression) + 20 * traitK(c.sacrifice);
    if (d.tags.includes('шах')) value += 30 * traitK(c.aggression) + 15 * traitK(c.combination);
    if (d.tags.includes('рокировка')) value += 25 * policy.caution;
    if (d.isCapture && traitK(c.endgame) > 0.6) value += 10; // любители эндшпиля охотно меняются
    value += (Math.random() - 0.5) * noise;
    if (value > bestValue) { bestValue = value; best = d; }
  }
  return pool.find(cd => cd.move === best.uci) || candidates[0];
}

function detectCharacterMoveFlavor(chosenScore, topScore, moveObj) {
  state.lastMoveFlavor = null;
  if (chosenScore == null || topScore == null || !moveObj) return;
  const isTactical = moveObj.flags.includes('c') || moveObj.flags.includes('e');
  const deficit = topScore - chosenScore;
  if (deficit >= 40 && isTactical) {
    state.lastMoveFlavor = 'sacrifice';
  } else if (deficit <= 5 && isTactical && chosenScore >= 150) {
    state.lastMoveFlavor = 'goodCombo';
  }
  if (state.prevCharacterEval != null) {
    const swing = topScore - state.prevCharacterEval;
    if (swing >= 150 && !state.lastMoveFlavor) {
      state.lastMoveFlavor = 'opponentMistake';
    }
  }
  state.prevCharacterEval = topScore;
}

async function requestCharacterMove() {
  if (!state.game || state.isGameOver || state.game.turn() !== state.aiColor || !state.character) return;
  state.isThinking = true;
  setThinkingUI(true);
  updateStatus();

  const fen = state.game.fen();
  const movetime = movetimeForSkill(state.skillLevel);
  showEngineLoadingStatus();
  await waitForEngine(3000);
  const { multipv } = characterMovePolicy(state.character);
  const candidates = await searchTopMoves(fen, { movetime, multipv });

  let moveObj = null;
  let chosenScore = null;
  const topScore = candidates.length ? candidates[0].score : null;

  if (candidates.length) {
    const target = pickCharacterMove(fen, candidates);
    moveObj = applyUciMove(target.move);
    chosenScore = target.score;
  }

  if (moveObj === null) {
    moveObj = pickFallbackMove();
    chosenScore = null;
  }

  if (moveObj) {
    detectCharacterMoveFlavor(chosenScore, topScore, moveObj);
    state.fenHistory.push(state.game.fen());
    onMoveMade(moveObj, false);
  }
  state.isThinking = false;
  setThinkingUI(false);
  updateStatus();
}

/* ---- Реакции персонажа на события партии ---- */
// Один и тот же образ для чата с игроком и для реплик по ходу партии.
// Персонаж всегда помнит, что прямо сейчас играет с игроком в шахматы.
// На вопросы отвечает по-человечески и по существу (не сводит любой вопрос к
// шахматам), а сам заговаривает только о партии — с опорой на разговор.
function buildCharacterPersonaPrompt() {
  const c = state.character;
  return `Ты — ${c.name}. ${c.shortDescription}
Прямо сейчас ты играешь партию в шахматы против собеседника и переговариваешься с ним за доской. Ты живая личность со своим характером, юмором и настроением, а не бот.
Как ты играешь: ${c.style}
Как ты говоришь: ${c.tone}${c.persona ? `\nО тебе: ${c.persona}` : ''}

Правила:
- Ты всегда помнишь, что идёт партия: кто как сходил, как складывается игра, о чём вы уже говорили. Пометки [Фон: …] — это то, что происходит на доске, а не слова собеседника.
- Когда собеседник что-то спрашивает или говорит, отвечай по существу и по-человечески, даже если это не о шахматах: не переводи каждую реплику в шахматы и не притягивай шахматные метафоры. Можно коротко вернуться к партии, если это к месту.
- Когда говоришь сам, без вопроса собеседника, — говори о партии: о ходах, ситуации на доске, своих планах и настроении от игры. Опирайся на то, о чём вы уже говорили: подхвати шутку, напомни сказанное, ответь на старую подколку.
- Говори как человек: ${AI_LANGUAGE}, от первого лица, 1–3 предложения, без списков, кавычек и разметки. Можно шутить, спорить, ворчать — в своём характере. Не будь услужливым ассистентом и не повторяй одни и те же фразы.
- Ты соперник: не подсказывай собеседнику ходы и не оценивай позицию в его пользу. Если просят — откажи по-своему.`;
}

// Короткая сводка партии для пометок [Фон: …]: цвет, номер хода, последние
// ходы и материал. Без FEN — модели нужен смысл, а не координаты.
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function describeGameForCharacter() {
  const game = state.game;
  const history = game.history();
  const myColor = state.aiColor === 'w' ? 'белыми' : 'чёрными';
  const moveNo = Math.floor(history.length / 2) + 1;
  const recent = history.slice(-4).join(' ');
  let mine = 0;
  let theirs = 0;
  for (const row of game.board()) {
    for (const sq of row) {
      if (!sq) continue;
      if (sq.color === state.aiColor) mine += PIECE_VALUES[sq.type];
      else theirs += PIECE_VALUES[sq.type];
    }
  }
  const diff = mine - theirs;
  const material = diff === 0 ? 'материал равный'
    : diff > 0 ? `у тебя больше материала на ${diff}` : `у собеседника больше материала на ${-diff}`;
  const turn = game.turn() === state.aiColor ? 'сейчас твой ход' : 'сейчас ход собеседника';
  return `ты играешь ${myColor}, ход ${moveNo}${recent ? `, последние ходы: ${recent}` : ', партия только началась'}, ${material}, ${turn}`;
}

const CHARACTER_REPLY_COOLDOWN_MS = 30000;
const CHARACTER_QUIET_PLIES = 12;    // столько полуходов тишины, прежде чем персонаж может заговорить сам
const CHARACTER_QUIET_CHANCE = 0.5;  // чтобы реплики не звучали строго по расписанию

async function characterReact(context, isAuto = false) {
  if (state.mode !== 'characters' || !state.character) return;
  const gameStartedAt = state.gameStartedAt;
  if (isAuto) {
    // Отмечаем сразу, а не после ответа: иначе за время запроса уйдёт второй
    state.autoReplyPending = true;
    state.lastAutoReplyTime = Date.now();
    state.pliesSinceCharacterSpoke = 0;
  }
  try {
    // Последние реплики разговора — чтобы персонаж не забывал, о чём вы только что говорили.
    const messages = [
      { role: 'system', content: buildCharacterPersonaPrompt() },
      ...trimHistory(state.chatApiHistory, 10),
      { role: 'user', content: `[Фон: ${describeGameForCharacter()}. ${context}]\nСкажи сам, без вопроса собеседника, одну-две фразы о партии в своём образе, учитывая ваш разговор.` },
    ];
    const reply = await provodChat(messages, { temperature: 1.0, kind: 'game', fast: true });
    const clean = stripMarkdown(reply).replace(/^["«]+|["»]+$/g, '').trim();
    // Пока шёл запрос, игрок начал новую партию — реплика уже не к месту
    if (!clean || gameStartedAt !== state.gameStartedAt) return;

    if (isAuto) {
      // проверка на дубликат среди последних 5 реплик
      if (state.lastAutoReplies.includes(clean)) return;
      state.lastAutoReplies.push(clean);
      if (state.lastAutoReplies.length > 5) state.lastAutoReplies.shift();
    }

    // добавить в историю чата (API) – для контекста
    state.chatApiHistory.push({ role: 'assistant', content: clean });
    // добавить в отображение
    appendChatMessage('character', clean, { typewriter: true });
  } catch (error) {
    console.error('Ошибка реплики персонажа:', error);
    if (error.code === 'GAME_LIMIT_REACHED' && !state.gameLimitNotified && gameStartedAt === state.gameStartedAt) {
      state.gameLimitNotified = true;
      logSystemChat(chatErrorMessage(error));
    }
  } finally {
    if (isAuto && gameStartedAt === state.gameStartedAt) state.autoReplyPending = false;
  }
}

function triggerCharacterEvents(move, isUserMove) {
  if (state.mode !== 'characters' || !state.character) return;
  state.pliesSinceCharacterSpoke++;
  const flavor = state.lastMoveFlavor;
  state.lastMoveFlavor = null;
  const game = state.game;
  const isMate = game.in_checkmate();
  // Мат звучит всегда, остальное — не чаще раза в CHARACTER_REPLY_COOLDOWN_MS
  const isBusy = state.autoReplyPending || Date.now() - state.lastAutoReplyTime < CHARACTER_REPLY_COOLDOWN_MS;
  if (!isMate && isBusy) return;
  let event = null;
  if (isMate) {
    event = isUserMove ? 'mate_lost' : 'mate_won';
  } else if (!isUserMove && move.captured === 'q') {
    event = 'captured_queen';
  } else if (isUserMove && move.captured === 'q') {
    event = 'player_captured_queen';
  } else if (!isUserMove && flavor === 'sacrifice') {
    event = 'sacrifice';
  } else if (!isUserMove && flavor === 'goodCombo') {
    event = 'good_combo';
  } else if (!isUserMove && flavor === 'opponentMistake') {
    event = 'opponent_mistake';
  } else if (game.in_check()) {
    event = isUserMove ? 'player_gives_check' : 'character_gives_check';
  } else if (!isUserMove && state.pliesSinceCharacterSpoke >= CHARACTER_QUIET_PLIES && Math.random() < CHARACTER_QUIET_CHANCE) {
    event = 'quiet';
  }
  if (!event) return;
  const contexts = {
    mate_won: `Вы только что поставили сопернику мат ходом ${move.san}.`,
    mate_lost: 'Соперник только что поставил вам мат.',
    captured_queen: `Вы взяли ферзя соперника ходом ${move.san}.`,
    sacrifice: `Вы сделали рискованное взятие ходом ${move.san}, следуя своему стилю игры.`,
    good_combo: `Вы нашли сильную тактическую комбинацию ходом ${move.san}.`,
    opponent_mistake: 'Соперник только что допустил заметную ошибку в партии.',
    character_gives_check: `Вы объявили сопернику шах ходом ${move.san}.`,
    player_gives_check: 'Соперник только что объявил вам шах.',
    player_captured_queen: 'Соперник только что взял вашего ферзя.',
    quiet: `Партия идёт спокойно, вы только что сыграли ${move.san}. Скажи собеседнику что-нибудь о партии: как тебе игра, что задумал, подколи его за недавний ход или вспомни, о чём вы говорили.`,
  };
  if (event) {
    const context = contexts[event];
    if (context) {
      // Проверка на дублирование контекста? – можно по самому тексту, но в characterReact проверим
      characterReact(context, true); // isAuto = true
    }
  }
}

/* ---- Итоговая карточка партии против персонажа ---- */
// Нейросеть выбирает настроение из этого списка, карточка показывает его иконкой
const CHARACTER_MOOD_ICONS = {
  happy: 'mood-happy',
  calm: 'mood-smile',
  neutral: 'mood-neutral',
  sad: 'mood-sad',
  angry: 'mood-angry',
  surprised: 'mood-surprised',
};
function renderCharacterResultLoading() {
  $id('characterResultContent').innerHTML = `<p class="analysis-loading">${t('Персонаж обдумывает партию…')}</p>`;
}

function renderCharacterResult({ mood, favoriteMoment, comment }) {
  const c = state.character;
  $id('characterResultContent').innerHTML = `
    <div class="char-result-head">
      <span class="char-result-icon">♞</span>
      <span class="char-result-name">${escapeHtml(c ? c.name : '')}</span>
      <span class="char-result-mood">${achievementIconSvg(CHARACTER_MOOD_ICONS[mood])}</span>
    </div>
    <div class="char-result-row"><span>${t('Любимый момент')}</span><b>${escapeHtml(favoriteMoment)}</b></div>
    <p class="char-result-comment">${escapeHtml(comment)}</p>
  `;
}

async function generateCharacterEndSummary(resultText, outcome) {
  const c = state.character;
  if (!c) return;
  const pgn = state.game ? state.game.pgn() : '';
  const moodMap = { player_win: 'персонаж проиграл партию', character_win: 'персонаж выиграл партию', draw: 'партия завершилась вничью' };
  const prompt = `Персонаж: ${c.name}. Стиль игры: ${c.style}. Манера общения: ${c.tone}.
Черты характера: агрессивность ${c.aggression}/100, жертвы ${c.sacrifice}/100, эндшпиль ${c.endgame}/100, эмоциональность ${c.emotionality}/100.
Партия завершилась: ${resultText} (${moodMap[outcome] || 'результат неизвестен'}).
История партии (PGN): ${pgn || '—'}
Ответь СТРОГО валидным JSON без markdown и пояснений, в формате:
{"mood":"настроение персонажа, одно слово из списка: ${Object.keys(CHARACTER_MOOD_ICONS).join(', ')}","favoriteMoment":"короткая фраза о любимом моменте партии, до 12 слов, ${AI_LANGUAGE}","comment":"комментарий персонажа о партии в его манере общения, 1-2 предложения, ${AI_LANGUAGE}"}`;
  const fallbackMood = outcome === 'character_win' ? 'calm' : (outcome === 'player_win' ? 'sad' : 'neutral');
  try {
    const raw = await provodChat([{ role: 'user', content: prompt }], { temperature: 0.85, kind: 'game', fast: true });
    const parsed = JSON.parse(extractJson(raw));
    const mood = String(parsed.mood || '').trim().toLowerCase();
    renderCharacterResult({
      mood: CHARACTER_MOOD_ICONS[mood] ? mood : fallbackMood,
      favoriteMoment: stripMarkdown(String(parsed.favoriteMoment || '')).trim() || t('Момент, который запомнится надолго.'),
      comment: stripMarkdown(String(parsed.comment || '')).trim() || t('Хорошая была партия.'),
    });
  } catch (error) {
    console.error('Ошибка итогового комментария персонажа:', error);
    renderCharacterResult({ mood: fallbackMood, favoriteMoment: '—', comment: t('Комментарий персонажа сейчас недоступен.') });
  }
}
