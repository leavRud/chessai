// Чат с нейросетью и вкладки «Ходы / Чат» на узких экранах.
'use strict';

/* =========================================================================
   ЧАТ / ДИАЛОГ
   ========================================================================= */
function buildChatSystemPrompt() {
  const lengthMap = {
    short: 'Отвечай очень кратко — 1–2 предложения.',
    medium: 'Отвечай кратко и по делу (2–5 предложений, если игрок явно не просит подробнее).',
    long: 'Можешь отвечать подробно — до 8–10 предложений, если это уместно.',
  };
  const lengthRule = lengthMap[state.settings.responseLength] || lengthMap.medium;
  if (state.mode === 'characters' && state.character) return buildCharacterPersonaPrompt();
  return `Ты — шахматный ассистент внутри приложения. Общайся с игроком ${AI_LANGUAGE}. ${lengthRule}
Тебе будут присылать текущую позицию в FEN, историю ходов (PGN), готовый анализ Stockfish (лучший ход, оценку, глубину, варианты) и вопрос игрока.
Stockfish — единственный источник объективно лучшего хода и оценки позиции. Ты НЕ придумываешь и не подбираешь лучший ход самостоятельно: если в сообщении есть блок STOCKFISH, при вопросах «какой ход лучше» называй именно bestMove оттуда (или один из ALTERNATIVES) и объясняй его человеческим языком. Если блока STOCKFISH нет — прямо скажи, что анализ ещё не готов, вместо того чтобы гадать самому.
Отвечай на конкретный вопрос: подсказки по позиции, угрозы, оценка ходов, стратегические советы. Не давай длинных планов — только одну-две идеи.
Отвечай простым текстом, без markdown-разметки (никаких **, #, списков через - или цифры).`;
}

// Возвращает объективный контекст Stockfish для текущей FEN, используя ТОЛЬКО
// общий analysisCache/очередь (никакого параллельного независимого анализа —
// ТЗ п.13). Если качество кэша для этой позиции недостаточное — приоритет
// позиции в очереди поднимается, и мы дожидаемся более качественного
// результата (через analyzePosition), вместо того чтобы сразу отдавать
// слабый depth 7 как «финальный».
async function getStockfishContextForChat(fen, { wantAlternatives = false } = {}) {
  const ready = await waitForEngine(3000);
  if (!ready || !isEngineReady) return null;
  const weak = state.settings.analysisMode === 'weak';
  const minDepth = weak ? ANALYSIS_TARGET.weakChatMinDepth : ANALYSIS_TARGET.chatMinDepth;

  let entry = analysisCache.get(fen);
  // Качество считается достаточным ТОЛЬКО если и глубина, и confidence в
  // порядке (ТЗ п.4) — одного depth >= chatMinDepth недостаточно, если
  // оценка при этом нестабильна (confidence === 'low').
  const isGoodEnough = (e) => !!e && e.depth >= minDepth && e.confidence !== 'low';
  if (!isGoodEnough(entry)) {
    enqueueAnalysisTask(fen, PRIORITY.CURRENT, minDepth);
    entry = await analyzePosition(fen, { minDepth, movetime: 700 });
    // analyzePosition гарантирует depth >= minDepth, но confidence мог
    // остаться low (нестабильная оценка на этой глубине) — в этом случае
    // доуглубляем ещё немного и используем то, что получилось, не блокируя
    // ответ чата бесконечно.
    if (entry && entry.confidence === 'low') {
      entry = await analyzePosition(fen, { minDepth: minDepth + 4, movetime: 700 });
    }
  }

  let alternatives = [];
  if (wantAlternatives && entry) {
    const candidates = await searchTopMoves(fen, { movetime: 700, multipv: 3 });
    if (candidates.length) {
      // Обновляем ту же запись кэша данными top-1 из MultiPV — не создаём
      // отдельную независимую структуру для чата.
      mergeAnalysisResult(fen, { ...entry, bestMove: candidates[0].move, score: candidates[0].score, multipv: candidates.length });
      entry = analysisCache.get(fen);
    }
    alternatives = describeCandidateMoves(fen, candidates);
  }
  return { entry, alternatives };
}

// Форматирует блок STOCKFISH/ALTERNATIVES для промпта нейросети (ТЗ п.12).
function formatStockfishContextBlock(fen, sf) {
  if (!sf || !sf.entry || sf.entry.score == null) {
    return '\nSTOCKFISH: анализ этой позиции ещё не готов (недостаточная глубина).';
  }
  const { entry, alternatives } = sf;
  let bestSan = entry.bestMove;
  try {
    const g = new Chess(fen);
    const from = entry.bestMove.substring(0, 2);
    const to = entry.bestMove.substring(2, 4);
    const promotion = entry.bestMove.length === 5 ? entry.bestMove[4] : 'q';
    const mv = g.move({ from, to, promotion });
    if (mv) bestSan = mv.san;
  } catch (e) { /* оставляем UCI, если не распарсилось */ }

  let block = `\nSTOCKFISH:\nBest move: ${bestSan}\nEvaluation (centipawns, с точки зрения хода в этой FEN): ${entry.score}\nDepth: ${entry.depth}${entry.seldepth ? ` (seldepth ${entry.seldepth})` : ''}\nPV: ${entry.pv || '—'}`;
  if (alternatives && alternatives.length) {
    block += `\nALTERNATIVES:\n${alternatives.map((a, i) => `${i + 1}. ${a.san} (${a.score})`).join('\n')}`;
  }
  return block;
}

// Персонаж — собеседник за доской, а не шахматный справочник: ему уходят
// слова игрока как есть плюс короткая сводка партии (describeGameForCharacter).
// Без FEN и PGN — иначе модель видит в любой реплике «вопрос по позиции».
function buildCharacterChatMessage(question) {
  return `[Фон: ${describeGameForCharacter()}]\n${question}`;
}

async function buildChatContextMessage(question) {
  if (state.mode === 'characters' && state.character) return buildCharacterChatMessage(question);
  const game = state.game;
  const fen = game.fen();
  const sideLabel = game.turn() === 'w' ? 'белые' : 'чёрные';
  const pgn = game.pgn() || '—';
  const isCharacterMode = state.mode === 'characters';
  const asksForMove = /куда|какой ход|сходить|посоветуй ход|что делать|мой ход|подскажи|совет|как сыграть|best move|which move|what move|my move|what should i|what do i|hint|advice|advise|suggest/i.test(question);
  let extra = '';
  let sfBlock = '';
  let lastMoveLossBlock = '';

  if (!isCharacterMode) {
    // Персонажи (п.12) — соперник, а не помощник, поэтому Stockfish-контекст
    // ему намеренно не передаём (как и раньше — никаких подсказок).
    const sf = await getStockfishContextForChat(fen, { wantAlternatives: asksForMove });
    sfBlock = formatStockfishContextBlock(fen, sf);

    // «Мой последний ход» — ход игрока, а не последний ход партии: против
    // Stockfish последним почти всегда ходит движок, и раньше нейросеть
    // разбирала его ход как ход игрока. Вдвоём за доской — ход любой стороны.
    const history = game.history({ verbose: true });
    let lastIndex = history.length - 1;
    if (state.mode !== 'friend') {
      while (lastIndex >= 0 && history[lastIndex].color !== state.playerColor) lastIndex--;
    }
    const lastMove = history[lastIndex];
    if (lastMove && state.fenHistory[lastIndex + 1]) {
      const beforeFen = state.fenHistory[lastIndex];
      const afterFen = state.fenHistory[lastIndex + 1];
      const beforeEntry = analysisCache.get(beforeFen);
      const afterEntry = analysisCache.get(afterFen);
      const weak = state.settings.analysisMode === 'weak';
      const minDepth = weak ? ANALYSIS_TARGET.weakChatMinDepth : ANALYSIS_TARGET.chatMinDepth;
      if (!beforeEntry || beforeEntry.depth < minDepth) {
        // Не блокируем текущий ответ — просто повышаем приоритет этой
        // позиции в общей очереди, чтобы в следующий раз CPL был точнее.
        enqueueAnalysisTask(beforeFen, PRIORITY.LAST_PLAYER_MOVE, minDepth);
      }
      const beforeAbs = scoreAbsoluteWhite(beforeEntry, beforeFen);
      const afterAbs = scoreAbsoluteWhite(afterEntry, afterFen);
      const moveNo = `${Math.floor(lastIndex / 2) + 1}.${lastMove.color === 'b' ? '..' : ''}`;
      lastMoveLossBlock = `\nPLAYER'S LAST MOVE: ${moveNo}${lastMove.san} (${lastMove.color === 'w' ? 'белые' : 'чёрные'})`;
      if (beforeAbs != null && afterAbs != null) {
        const deltaAbs = afterAbs - beforeAbs;
        const loss = Math.max(0, lastMove.color === 'w' ? -deltaAbs : deltaAbs);
        lastMoveLossBlock += `\nLAST MOVE LOSS: ${Math.round(loss)} CPL`;
      }
      const opponentReply = history[lastIndex + 1];
      if (opponentReply) lastMoveLossBlock += `\nOPPONENT'S REPLY: ${opponentReply.san}`;
    }
  }

  // Материал считаем сами: по одной FEN модель путается и называет лишнего
  // слона «лишней пешкой».
  const materialBlock = `\nMATERIAL: ${describeMaterial(game)}`;
  const playerBlock = state.mode === 'friend'
    ? ''
    : `\nИгрок играет: ${state.playerColor === 'w' ? 'белыми' : 'чёрными'}`;

  if (asksForMove && !isCharacterMode) {
    const moves = game.moves();
    extra = `\nСписок допустимых ходов в этой позиции (SAN): ${moves.join(', ')}. 
Игрок просит конкретный совет по ходу. Называй ход из блока STOCKFISH (Best move) или из ALTERNATIVES и объясни коротко, почему он хорош.`;
  }
  return `CURRENT POSITION:
FEN: ${fen}
Сейчас ходят: ${sideLabel}${playerBlock}${materialBlock}
GAME HISTORY (PGN): ${pgn}${sfBlock}${lastMoveLossBlock}
PLAYER QUESTION: ${question}${extra}`;
}

// «белые: Ф, 2Л, 2С, 1К, 8п; чёрные: …; перевес: чёрные +3 (лишний слон)»
const MATERIAL_PIECES = [
  ['q', 9, 'Ф', 'ферзь'], ['r', 5, 'Л', 'ладья'], ['b', 3, 'С', 'слон'], ['n', 3, 'К', 'конь'], ['p', 1, 'п', 'пешка'],
];
function describeMaterial(game) {
  const count = { w: {}, b: {} };
  for (const row of game.board()) {
    for (const sq of row) if (sq) count[sq.color][sq.type] = (count[sq.color][sq.type] || 0) + 1;
  }
  const side = (c) => MATERIAL_PIECES.filter(([p]) => count[c][p]).map(([p, , short]) => `${count[c][p]}${short}`).join(' ') || '—';
  const points = (c) => MATERIAL_PIECES.reduce((sum, [p, value]) => sum + (count[c][p] || 0) * value, 0);
  const diff = points('w') - points('b');
  // Каких фигур у отстающей стороны меньше — так модель видит «лишний слон», а не только +3
  const extra = MATERIAL_PIECES
    .map(([p, , , name]) => [name, (count.w[p] || 0) - (count.b[p] || 0)])
    .filter(([, d]) => (diff > 0 ? d > 0 : d < 0))
    .map(([name, d]) => `${Math.abs(d)} ${name}`);
  const balance = diff === 0
    ? 'равенство'
    : `${diff > 0 ? 'белые' : 'чёрные'} +${Math.abs(diff)}${extra.length ? ` (лишние: ${extra.join(', ')})` : ''}`;
  return `белые: ${side('w')}; чёрные: ${side('b')}; перевес: ${balance}`;
}

function trimHistory(history, maxEntries = 12) {
  return history.slice(-maxEntries);
}

/* ---- Вкладки «Ходы / Чат» под доской (видны только на узких экранах) ---- */
function setMobileTab(name) {
  document.querySelector('.layout').dataset.mobileTab = name;
  document.querySelectorAll('.mobile-tab').forEach(tab => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
    if (active) tab.classList.remove('has-unread');
  });
}
document.querySelectorAll('.mobile-tab').forEach(tab => {
  tab.addEventListener('click', () => { playSound('ui'); setMobileTab(tab.dataset.tab); });
});

// Возвращает промис, который выполняется, когда текст допечатан до конца.
function appendChatMessage(role, text, { typewriter = false } = {}) {
  removeCharacterTypingBubble();
  state.chatDisplay.push({ role, text });
  if ((role === 'assistant' || role === 'character') && document.querySelector('.layout').dataset.mobileTab !== 'chat') {
    document.querySelector('.mobile-tab[data-tab="chat"]').classList.add('has-unread');
  }
  const div = document.createElement('div');
  div.className = `msg msg-${role}`;
  // У реплики персонажа над текстом стоит его имя
  let textEl = div;
  if (role === 'character') {
    const nameSpan = document.createElement('span');
    nameSpan.className = 'msg-character-name';
    nameSpan.textContent = state.character ? state.character.name : '';
    textEl = document.createElement('span');
    textEl.className = 'msg-character-text';
    div.append(nameSpan, textEl);
  }
  $id('chatLog').appendChild(div);
  $id('chatLog').scrollTop = $id('chatLog').scrollHeight;
  playSound('notification');

  if (!typewriter) {
    textEl.textContent = text;
    return Promise.resolve();
  }

  let i = 0;
  const speed = 18;
  const chatLog = $id('chatLog');
  return new Promise((resolve) => {
    const step = () => {
      i += 1;
      textEl.textContent = text.slice(0, i);
      if (i % 3 === 0) chatLog.scrollTop = chatLog.scrollHeight;
      if (i < text.length) {
        setTimeout(step, speed);
      } else {
        chatLog.scrollTop = chatLog.scrollHeight;
        resolve();
      }
    };
    step();
  });
}

/* ---- Персонаж пишет сам: пузырь «печатает…» и блокировка ввода ----
   Пока персонаж готовит реплику без вопроса игрока, писать нельзя: иначе
   вопрос и самостоятельная реплика разминутся, и в чате окажутся два ответа
   подряд, не связанные друг с другом. */
function showCharacterTypingBubble() {
  if ($id('characterTypingBubble')) return;
  const div = document.createElement('div');
  div.id = 'characterTypingBubble';
  div.className = 'msg msg-character msg-typing';
  div.innerHTML = '<span class="msg-character-name"></span><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
  div.querySelector('.msg-character-name').textContent = state.character ? state.character.name : '';
  $id('chatLog').appendChild(div);
  $id('chatLog').scrollTop = $id('chatLog').scrollHeight;
}
function removeCharacterTypingBubble() {
  const el = $id('characterTypingBubble');
  if (el) el.remove();
}

function setCharacterTyping(isTyping) {
  state.characterTyping = isTyping;
  const input = $id('chatInput');
  input.disabled = isTyping;
  // Обычную подсказку запоминаем при первом включении: к этому моменту
  // интерфейс уже переведён на выбранный язык.
  if (isTyping && input.dataset.placeholder == null) input.dataset.placeholder = input.getAttribute('placeholder') || '';
  if (isTyping && state.character) {
    input.setAttribute('placeholder', t('{name} пишет…', { name: state.character.name }));
  } else if (input.dataset.placeholder != null) {
    input.setAttribute('placeholder', input.dataset.placeholder);
  }
  $id('askBtn').disabled = isTyping || state.isAsking || input.value.trim().length === 0;
  if (isTyping) showCharacterTypingBubble();
  else removeCharacterTypingBubble();
}

function logSystemChat(text) {
  appendChatMessage('system', text);
}

function setAskLoading(isLoading) {
  state.isAsking = isLoading;
  $id('askBtn').disabled = isLoading || state.characterTyping || $id('chatInput').value.trim().length === 0;
  $id('askBtn').textContent = isLoading ? t('Думаю…') : t('Спросить');
}

async function handleAsk() {
  const input = $id('chatInput');
  const question = input.value.trim();
  if (!question || state.isAsking || state.characterTyping || !state.game) return;
  if (!chatSignedIn) {
    logSystemChat(chatErrorMessage({ code: 'AUTH_REQUIRED' }));
    openAuthModal();
    return;
  }
  input.value = '';
  appendChatMessage('user', question);
  setAskLoading(true);
  trackGoal('ai_question', { mode: state.mode });

  const contextualUser = await buildChatContextMessage(question);
  state.chatApiHistory.push({ role: 'user', content: contextualUser });

  try {
    const messages = [
      { role: 'system', content: buildChatSystemPrompt() },
      ...trimHistory(state.chatApiHistory)
    ];
    const isCharacterChat = state.mode === 'characters' && !!state.character;
    // Все ответы — на быстрой модели: «рассуждающая» основная тратила до 2000
    // скрытых токенов и отвечала до минуты. Персонажу ещё и температура повыше.
    const temperature = isCharacterChat ? 0.95 : state.settings.temperature / 10;
    const reply = await provodChat(messages, { temperature, fast: true });
    const cleanReply = stripMarkdown(reply);
    state.chatApiHistory.push({ role: 'assistant', content: reply });
    const isCharacterReply = state.mode === 'characters' && state.character;
    if (isCharacterReply) {
      // Только что ответил игроку — сам заговорит не раньше, чем через паузу
      state.pliesSinceCharacterSpoke = 0;
      state.lastAutoReplyTime = Date.now();
    }
    await appendChatMessage(isCharacterReply ? 'character' : 'assistant', cleanReply || t('(пустой ответ модели)'), { typewriter: true });
    hideConnectionBanner();
  } catch (error) {
    console.error('Ошибка чата:', error);
    // Вопрос без ответа не должен оставаться в истории, которая уходит модели.
    state.chatApiHistory.pop();
    appendChatMessage('system', chatErrorMessage(error));
    if (error.code === 'AUTH_REQUIRED') { chatSignedIn = false; renderChatQuota(null); openAuthModal(); }
  } finally {
    setAskLoading(false);
  }
}

$id('askBtn').addEventListener('click', () => {
  playSound('ui');
  handleAsk();
});
$id('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleAsk();
  }
});
$id('chatInput').addEventListener('input', () => {
  const hasText = $id('chatInput').value.trim().length > 0;
  $id('askBtn').classList.toggle('btn-primary-active', hasText);
  $id('askBtn').disabled = !hasText || state.isAsking || state.characterTyping;
});
$id('askBtn').disabled = $id('chatInput').value.trim().length === 0;

$id('retryAiBtn').addEventListener('click', () => {
  hideConnectionBanner();
  if (state.mode === 'ai' && state.game.turn() === state.aiColor) {
    requestAiMove();
  } else if (state.mode === 'characters' && state.game.turn() === state.aiColor) {
    requestCharacterMove();
  }
});
