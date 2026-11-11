// Режим «Против персонажей»: создание персонажа и его карточка.
'use strict';

/* =========================================================================
   РЕЖИМ «ПРОТИВ ПЕРСОНАЖЕЙ» — состояние
   ========================================================================= */
const charState = {
  activeTab: 'name',
  lastInput: null, // { type: 'name'|'desc', value: string }
};

function openCharacterSetup() {
  // Персонажей ведёт нейросеть, а она доступна только после входа.
  if (!chatSignedIn) {
    openAuthModal(t('Войдите, чтобы играть против персонажей: ими управляет нейросеть'));
    return;
  }
  hideModal('characterCardModal');
  $id('charSetupError').classList.add('hidden');
  showModal('characterSetupModal');

  // Заполняем примеры из статистики
  const examplesContainer = document.getElementById('charExamples');
  if (!examplesContainer) return;
  const stats = window.Achievements?.getStats?.();
  const played = stats?.charactersPlayed || [];
  const recent = Array.from(new Set(played)).slice(-4).reverse();
  if (recent.length === 0) {
    examplesContainer.innerHTML = '';
    examplesContainer.style.display = 'none';
  } else {
    examplesContainer.style.display = 'flex';
    examplesContainer.innerHTML = recent.map(name =>
      `<button type="button" class="char-example-chip" data-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`
    ).join('');
    // Перепривязываем обработчики кликов (если нужны)
    examplesContainer.querySelectorAll('.char-example-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.getElementById('charNameInput').value = chip.dataset.name;
      });
    });
  }
}

/* ---- Вкладки: имя / описание ---- */
document.querySelectorAll('.char-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    charState.activeTab = target;
    document.querySelectorAll('.char-tab').forEach(t => {
      const active = t === tab;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', String(active));
    });
    $id('charNameTab').classList.toggle('hidden', target !== 'name');
    $id('charDescTab').classList.toggle('hidden', target !== 'desc');
  });
});

document.querySelectorAll('.char-example-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    $id('charNameInput').value = chip.dataset.name;
  });
});

$id('charSetupBackBtn').addEventListener('click', () => {
  hideModal('characterSetupModal');
  showHomeScreen();
});

$id('charCreateBtn').addEventListener('click', () => {
  playSound('ui');
  const errEl = $id('charSetupError');
  errEl.classList.add('hidden');
  let input;
  if (charState.activeTab === 'name') {
    const value = $id('charNameInput').value.trim();
    if (!value) {
      errEl.textContent = t('Введите имя персонажа.');
      errEl.classList.remove('hidden');
      playSound('error');
      return;
    }
    input = { type: 'name', value };
  } else {
    const value = $id('charDescInput').value.trim();
    if (!value) {
      errEl.textContent = t('Опишите вашего персонажа.');
      errEl.classList.remove('hidden');
      playSound('error');
      return;
    }
    input = { type: 'desc', value };
  }
  charState.lastInput = input;
  charState.fromLink = false;
  hideModal('characterSetupModal');
  trackGoal('character_create', { by: input.type });
  runCharacterGeneration(input);
});

/* ---- Карточка персонажа ---- */
$id('charCardBackBtn').addEventListener('click', () => {
  hideModal('characterCardModal');
  // Персонаж пришёл по ссылке — «Назад» ведёт на главный экран, а не к созданию своего
  if (charState.fromLink) { charState.fromLink = false; showHomeScreen(); return; }
  openCharacterSetup();
});
$id('charCardRegenBtn').addEventListener('click', () => {
  if (!charState.lastInput) return;
  runCharacterGeneration(charState.lastInput);
});
/* ---- Цвет игрока против персонажа: белые, чёрные или случайно ----
   Выбор запоминается; «Случайно» бросает жребий при каждом старте. */
const CHAR_COLOR_KEY = 'chessLastCharColor';
let charChosenColor = 'w';
function syncCharColorButtons() {
  document.querySelectorAll('#charColorRow .color-choice-btn').forEach(b => {
    const active = b.dataset.color === charChosenColor;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-pressed', String(active));
  });
}
try {
  const saved = localStorage.getItem(CHAR_COLOR_KEY);
  if (['w', 'b', 'r'].includes(saved)) charChosenColor = saved;
} catch (e) { /* хранилище недоступно — по умолчанию белые */ }
syncCharColorButtons();
document.querySelectorAll('#charColorRow .color-choice-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    playSound('ui');
    charChosenColor = btn.dataset.color;
    try { localStorage.setItem(CHAR_COLOR_KEY, charChosenColor); } catch (e) { /* не запоминаем */ }
    syncCharColorButtons();
  });
});

$id('charCardPlayBtn').addEventListener('click', () => {
  if (!state.character) return;
  // Гость открыл персонажа по ссылке: играть можно после входа, затем карточка откроется снова
  if (!chatSignedIn) {
    rememberPendingSharedCharacter();
    openAuthModal(t('Войдите, чтобы сыграть с персонажем «{name}»: им управляет нейросеть', { name: state.character.name }));
    return;
  }
  if (charState.fromLink && state.character.shareId) countSharedCharacterPlay(state.character.shareId);
  charState.fromLink = false;
  hideModal('characterCardModal');
  state.mode = 'characters';
  const color = charChosenColor === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : charChosenColor;
  state.playerColor = color;
  state.aiColor = color === 'w' ? 'b' : 'w';
  state.skillLevel = eloToSkillLevel(state.character.elo);
  if (stockfish && isEngineReady) {
    stockfish.postMessage(`setoption name Skill Level value ${state.skillLevel}`);
  }
  hideHomeScreen();
  initGame();
});

function setCharCardLoading(isLoading) {
  $id('characterCardLoading').classList.toggle('hidden', !isLoading);
  $id('characterCardBody').classList.toggle('hidden', isLoading);
  $id('charCardPlayBtn').disabled = isLoading;
  $id('charCardRegenBtn').disabled = isLoading;
}

async function runCharacterGeneration(input) {
  showModal('characterCardModal');
  $id('charCardError').classList.add('hidden');
  setCharCardLoading(true);
  try {
    const profile = await generateCharacterProfile(input);
    state.character = profile;
    renderCharacterCard(profile);
    setCharCardLoading(false);
  } catch (error) {
    console.error('Ошибка генерации персонажа:', error);
    setCharCardLoading(false);
    $id('characterCardBody').classList.add('hidden');
    const errEl = $id('charCardError');
    errEl.textContent = t('Не удалось создать персонажа: {error}. Нажмите «Перегенерировать», чтобы попробовать снова.', { error: error.message });
    errEl.classList.remove('hidden');
    playSound('error');
  }
}

/* ---- Генерация профиля персонажа ---- */
function buildCharacterGenSystemPrompt() {
  return `Ты создаёшь игровой профиль шахматного персонажа для приложения. Не преувеличивай умения. 
  Отвечай ТОЛЬКО валидным JSON-объектом без markdown-разметки, без пояснений, без \`\`\`.
  {
  "name": "имя персонажа",
  "shortDescription": "одно короткое предложение о персонаже",
  "style": "1-2 предложения о стиле игры в шахматы",
  "white": "id системы за белых",
  "defenses": ["id защиты против 1.e4", "id защиты против 1.d4"],
  "aggression": число 0-100,
  "combination": число 0-100,
  "sacrifice": число 0-100,
  "caution": число 0-100,
  "emotionality": число 0-100,
  "endgame": число 0-100,
  "drawishness": число 0-100,
  "eloReason": "одна короткая фраза: насколько этот персонаж реально умеет играть в шахматы и почему",
  "elo": число от 400 до 2850,
  "tone": "манера общения персонажа, коротко",
  "persona": "кто он вне шахмат: чем живёт, что любит и не любит, о чём охотно болтает, пара характерных словечек — 2-3 предложения"
  }
  Все текстовые поля — ${AI_LANGUAGE}. Придумай образ ярко и с характером. 
  Если дано известное имя, опирайся на известные о нём черты и адаптируй их под шахматный стиль и манеру речи.
  Если дано произвольное описание — придумай персонажа с нуля строго по этому описанию, включая подходящее имя.
  Числовые черты должны логично соответствовать описанию.

  Рейтинг elo — это реальная сила игры в шахматы, а не известность, ум, богатство или крутость персонажа. Нейросети обычно его завышают — будь строг:
  - 400–700: не играет в шахматы, знает только как ходят фигуры; дети, животные, простоватые и легкомысленные персонажи;
  - 700–1100: иногда играет с друзьями ради развлечения — так играет большинство обычных людей, в том числе знаменитостей;
  - 1100–1500: регулярно играет, знает базовые дебюты и тактику;
  - 1500–1900: сильный любитель, разряд, играет в турнирах;
  - 1900–2300: кандидат в мастера и мастер;
  - 2300–2850: профессиональные шахматисты, гроссмейстеры.
  Если это реальный шахматист — бери его настоящий рейтинг. Если о шахматах персонажа ничего не известно — ставь 600–1100, даже если он гений в другой области. Выше 1500 — только если игра в шахматы прямо известна о персонаже или указана в описании.
  Учитывай и экранизации, сериалы, игры: если там персонаж играет в шахматы на высоком уровне (Шерлок Холмс против Мориарти, Спок, Бет Хармон), это и есть его сила — ставь 1900–2500 по тому, как сильно он играет.

  Дебютный репертуар выбери под характер, только id из списков ниже (атакующим — острые гамбиты и дракон, осторожным — солидные системы, новичкам — простые):
  "white" — система за белых: ${openingIdsFor('w')};
  "defenses" — ровно две защиты за чёрных, одна против 1.e4: ${openingIdsFor('b', 'e4')};
  и одна против 1.d4: ${openingIdsFor('b', 'd4')}.`;
}

function openingIdsFor(side, against) {
  return Object.entries(OPENING_BOOK)
    .filter(([, opening]) => opening.side === side && (!against || opening.against === against))
    .map(([id, opening]) => `${id} (${opening.name.ru})`)
    .join(', ');
}

function extractJson(text) {
  const cleaned = String(text ?? '').replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return cleaned;
  return cleaned.slice(start, end + 1);
}

function normalizeCharacterProfile(p, input) {
  const clampNum = (v, min, max, def) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? clamp(n, min, max) : def;
  };
  const fallbackName = input.type === 'name' ? input.value : t('Загадочный соперник');
  const name = String(p.name || fallbackName).trim().slice(0, 40) || fallbackName;
  // Карточка показывает ровно те дебюты, которые персонаж разыгрывает по книге
  const ids = [p.white, ...(Array.isArray(p.defenses) ? p.defenses : [])];
  const repertoire = resolveCharacterRepertoire(ids, p.openings);
  return {
    repertoire,
    name,
    shortDescription: String(p.shortDescription || '').trim().slice(0, 180) || t('Загадочный противник со своим стилем игры.'),
    style: String(p.style || '').trim().slice(0, 320) || t('Играет непредсказуемо, полагаясь на интуицию.'),
    openings: describeCharacterRepertoire(repertoire),
    aggression: clampNum(p.aggression, 0, 100, 50),
    combination: clampNum(p.combination, 0, 100, 50),
    sacrifice: clampNum(p.sacrifice, 0, 100, 30),
    caution: clampNum(p.caution, 0, 100, 50),
    emotionality: clampNum(p.emotionality, 0, 100, 50),
    endgame: clampNum(p.endgame, 0, 100, 50),
    drawishness: clampNum(p.drawishness, 0, 100, 30),
    elo: clampNum(p.elo, 400, 2900, 1000),
    tone: String(p.tone || '').trim().slice(0, 160) || t('Сдержанная, немногословная.'),
    persona: String(p.persona || '').trim().slice(0, 500),
  };
}

async function generateCharacterProfile(input) {
  const userMsg = input.type === 'name'
    ? `Имя персонажа: ${input.value}`
    : `Описание персонажа от пользователя: ${input.value}`;
  const messages = [
    { role: 'system', content: buildCharacterGenSystemPrompt() },
    { role: 'user', content: userMsg },
  ];
  const raw = await provodChat(messages, { temperature: 0.95, kind: 'game', fast: true });
  let profile;
  try {
    profile = JSON.parse(extractJson(raw));
  } catch (e) {
    throw new Error(t('не удалось разобрать ответ нейросети'));
  }
  return normalizeCharacterProfile(profile, input);
}

function eloToSkillLevel(elo) {
  const level = Math.round(((clamp(elo, 500, 2900) - 500) / 2400) * 19) + 1;
  return clamp(level, 1, 20);
}

/* ---- Отрисовка карточки персонажа ---- */
function traitLevelLabel(value) {
  const v = clamp(value, 0, 100);
  if (v < 20) return t('очень низкая');
  if (v < 40) return t('низкая');
  if (v < 60) return t('средняя');
  if (v < 80) return t('высокая');
  return t('очень высокая');
}

function eloDifficultyLabel(elo) {
  const e = clamp(elo, 500, 2900);
  if (e < 900) return t('новичок');
  if (e < 1200) return t('любитель');
  if (e < 1600) return t('уверенный игрок');
  if (e < 2000) return t('кандидат в мастера');
  if (e < 2400) return t('мастер');
  return t('гроссмейстер');
}

function charBarRow(label, value) {
  const pct = clamp(value, 0, 100);
  const hue = pct * 1.2;
  const color = `hsl(${hue}, 80%, 50%)`;
  return `<div class="char-bar-row">
    <span class="char-bar-label">${escapeHtml(label)}</span>
    <span class="char-bar-track" title="${pct}/100">
      <span class="char-bar-fill" style="width:${pct}%; height:100%; background:${color}; display:block;"></span>
    </span>
    <span class="char-bar-value">${traitLevelLabel(pct)}</span>
  </div>`;
}

function renderCharacterCard(profile) {
  // Перегенерировать чужого персонажа по ссылке нечем: исходного запроса у нас нет
  $id('charCardRegenBtn').classList.toggle('hidden', !!charState.fromLink);
  $id('charCardName').textContent = profile.name;
  $id('charCardDesc').textContent = profile.shortDescription;
  const eloLabel = eloDifficultyLabel(profile.elo);
  $id('charCardElo').textContent = `${eloLabel.charAt(0).toUpperCase()}${eloLabel.slice(1)}\n≈${profile.elo} Elo`;
  $id('charCardBars').innerHTML = [
    charBarRow(t('Агрессия'), profile.aggression),
    charBarRow(t('Тактика'), profile.combination),
    charBarRow(t('Жертвы'), profile.sacrifice),
    charBarRow(t('Осторожность'), profile.caution),
    charBarRow(t('Эндшпиль'), profile.endgame),
  ].join('');
  $id('charCardStyle').textContent = profile.style;
  $id('charCardTone').textContent = profile.openings ? t('Дебюты: {openings}', { openings: profile.openings }) : '';
}
