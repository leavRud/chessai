// Игра с другом по ссылке (chesai.ru/?g=<id>).
// Партия хранится в Supabase (online_games, см. миграцию 20261111160000_online_games.sql):
// ходы пишутся функцией online_move по секретному токену игрока, сопернику ход
// приходит мгновенно через Realtime broadcast, а раз в несколько секунд браузер
// сверяется с базой — на случай потерянного сообщения или перезагрузки страницы.
// Вход не нужен: друг играет гостем. Часов в такой партии нет, помощник молчит до конца партии.
'use strict';

const ONLINE_ID_RE = /^[0-9a-f]{10}$/;
const ONLINE_POLL_MS = 3000;
const online = {
  id: null, token: null, color: null, started: false,
  channel: null, channelReady: false, pendingMessages: [],
  pollTimer: null, syncing: false,
  queue: Promise.resolve(), // ходы и конец партии уходят на сервер строго по очереди
};
let onlineChosenColor = 'r';

/* ---------- Мелочи ---------- */
function onlineSeatKey(id) { return `chessOnline:${id}`; }
function saveOnlineSeat(id, token, color) {
  try { localStorage.setItem(onlineSeatKey(id), JSON.stringify({ token, color })); } catch (e) { /* без хранилища не продолжить после перезагрузки */ }
}
function readOnlineSeat(id) {
  try {
    const seat = JSON.parse(localStorage.getItem(onlineSeatKey(id)) || 'null');
    return seat && seat.token && (seat.color === 'w' || seat.color === 'b') ? seat : null;
  } catch (e) { return null; }
}
function forgetOnlineSeat(id) {
  try { localStorage.removeItem(onlineSeatKey(id)); } catch (e) { /* нечего удалять */ }
}
function onlineGameUrl(id) { return appLink('g', id); }
function myOnlineName() { return (getAccount()?.name || t('Гость')).slice(0, 40); }
// Гость без аккаунта приходит с именем «Гость» — на экране зовём его просто соперником
function isGuestName(name) { return !name || name === 'Гость' || name === t('Гость'); }
function displayOpponentName(name) { return isGuestName(name) ? t('Соперник') : name; }
function oppositeColor(c) { return c === 'w' ? 'b' : 'w'; }
function uciOf(move) { return move.from + move.to + (move.promotion || ''); }
function rpcErrorCode(error) { return ((error && error.message) || '').match(/[A-Z_]{6,}/)?.[0] || ''; }

// ?g=<id> в адресе: перезагрузка страницы возвращает в ту же партию.
function setOnlineUrl(id) {
  const params = new URLSearchParams(location.search);
  if (id) params.set('g', id); else params.delete('g');
  const q = params.toString();
  history.replaceState(history.state, '', location.pathname + (q ? `?${q}` : '') + location.hash);
}

async function fetchOnlineGame(id) {
  const { data, error } = await sb.rpc('get_online_game', { p_id: id });
  if (error) throw error;
  return data?.[0] || null;
}

/* ---------- Realtime ---------- */
function connectOnlineChannel(id) {
  disconnectOnlineChannel();
  online.channelReady = false;
  online.channel = sb.channel(`online-${id}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'msg' }, ({ payload }) => onOnlineMessage(payload))
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      online.channelReady = true;
      const queued = online.pendingMessages.splice(0);
      queued.forEach(sendOnlineMessage);
    });
}

function disconnectOnlineChannel() {
  if (online.channel) sb.removeChannel(online.channel);
  online.channel = null;
  online.channelReady = false;
  online.pendingMessages = [];
}

function sendOnlineMessage(payload) {
  if (!online.channel) return;
  if (!online.channelReady) { online.pendingMessages.push(payload); return; }
  online.channel.send({ type: 'broadcast', event: 'msg', payload }).catch(() => {});
}

function onOnlineMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'move' && state.mode === 'online' && state.game && !state.isGameOver) {
    const expected = state.game.history().length + 1;
    if (msg.ply === expected && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(msg.uci)) applyRemoteMove(msg.uci);
    else if (msg.ply > expected) syncOnlineFromServer();
  } else {
    // joined / finish — подробности берём из базы, сообщению не доверяем
    syncOnlineFromServer();
  }
}

function startOnlinePolling() {
  stopOnlinePolling();
  online.pollTimer = setInterval(() => syncOnlineFromServer(), ONLINE_POLL_MS);
}
function stopOnlinePolling() {
  clearInterval(online.pollTimer);
  online.pollTimer = null;
}

/* ---------- Сверка с базой ---------- */
async function syncOnlineFromServer() {
  if (!online.id || online.syncing) return;
  online.syncing = true;
  try {
    const row = await fetchOnlineGame(online.id);
    if (!row) return;
    // Ещё ждём соперника: он принял приглашение — начинаем
    if (!online.started) {
      if (row.status !== 'waiting') startOnlineGame(row);
      return;
    }
    const local = state.game.history({ verbose: true }).map(uciOf);
    const remote = row.moves || [];
    const samePrefix = local.every((m, i) => i >= remote.length || remote[i] === m);
    if (!samePrefix) {
      rebuildOnlineGame(remote);
    } else if (remote.length > local.length) {
      for (const uci of remote.slice(local.length)) {
        if (!applyRemoteMove(uci)) { rebuildOnlineGame(remote); break; }
      }
    }
    if (row.status === 'finished' && !state.isGameOver) finishFromServer(row);
    if (row.status === 'finished') stopOnlinePolling();
  } catch (e) {
    // Нет сети — попробуем на следующем такте
  } finally {
    online.syncing = false;
  }
}

/* ---------- Ходы ---------- */
function applyRemoteMove(uci) {
  const move = state.game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
  if (!move) return false;
  state.fenHistory.push(state.game.fen());
  onMoveMade(move, false);
  return true;
}

// Сыграть ходы молча (продолжение партии после перезагрузки)
function replayOnlineMoves(moves) {
  for (const uci of moves) {
    const move = state.game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
    if (!move) break;
    state.fenHistory.push(state.game.fen());
    if (move.captured) trackCapture(move);
  }
  state.board.position(state.game.fen(), false);
  renderMoveList();
  renderCaptured();
  updateStatus();
}

function rebuildOnlineGame(moves) {
  state.game = new Chess();
  state.fenHistory = [state.game.fen()];
  state.capturedByWhite = [];
  state.capturedByBlack = [];
  replayOnlineMoves(moves);
}

// Вызывается из onMoveMade после своего хода.
function onlineSendMove(move) {
  const ply = state.game.history().length;
  const uci = uciOf(move);
  const id = online.id;
  const token = online.token;
  online.queue = online.queue.then(async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { error } = await sb.rpc('online_move', { p_id: id, p_token: token, p_ply: ply, p_move: uci });
      if (!error) {
        hideConnectionBanner();
        sendOnlineMessage({ type: 'move', ply, uci });
        return;
      }
      const code = rpcErrorCode(error);
      if (code === 'OUT_OF_SYNC' || code === 'NOT_YOUR_TURN' || code === 'NOT_ACTIVE') {
        await syncOnlineFromServer();
        return;
      }
      if (attempt === 0) showConnectionBanner(t('Ход не дошёл до соперника — проверяем связь…'));
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
    showConnectionBanner(t('Нет связи с сервером. Ход отправится, когда страница снова увидит интернет.'));
    syncOnlineFromServer();
  });
}

// Конец партии: мат, пат, ничья (видят оба) или сдача.
function onlineReportFinish(result, reason) {
  if (!online.id) return;
  const id = online.id;
  const token = online.token;
  stopOnlinePolling();
  online.queue = online.queue.then(async () => {
    const { error } = await sb.rpc('online_finish', { p_id: id, p_token: token, p_result: result || 'draw', p_reason: reason });
    if (!error) sendOnlineMessage({ type: 'finish' });
  });
  forgetOnlineSeat(id);
}

// Соперник сдался (или конец партии, который мы пропустили).
function finishFromServer(row) {
  if (row.reason !== 'resign') {
    if (!checkGameOver()) stopOnlinePolling();
    return;
  }
  const winner = row.result;
  const iWon = winner === state.playerColor;
  const name = state.onlineOpponentName || t('Соперник');
  state.isGameOver = true;
  stopTimer();
  updateResignButtonLabel();
  stopBackgroundAnalysis();
  reportAchievementGameEnd('draw');
  forgetOnlineSeat(online.id);
  showResultModal(iWon ? t('{name} сдаётся. Вы победили!', { name }) : t('Вы сдались.'),
    iWon ? 'player_win' : 'character_win', 'resign', winner);
}

/* ---------- Начало партии ---------- */
function startOnlineGame(row) {
  online.started = true;
  hideModal('friendModal');
  hideModal('onlineJoinModal');
  state.mode = 'online';
  state.playerColor = online.color;
  state.aiColor = oppositeColor(online.color);
  const iAmCreator = online.color === row.creator_color;
  state.onlineOpponentName = displayOpponentName(iAmCreator ? row.joiner_name : row.creator_name);
  hideHomeScreen();
  initGame();
  replayOnlineMoves(row.moves || []);
  if (row.status === 'finished') {
    finishFromServer(row);
    return;
  }
  if (!checkGameOver()) startOnlinePolling();
}

// Уходим из партии (новая игра, главный экран). Незаконченная партия — сдача.
function leaveOnlineGame() {
  if (!online.id) return;
  if (state.mode === 'online' && state.game && !state.isGameOver) onlineReportFinish(null, 'resign');
  stopOnlinePolling();
  const id = online.id;
  // Даём сообщению о сдаче уйти, потом закрываем канал
  online.queue.then(() => { if (online.id !== id) return; disconnectOnlineChannel(); });
  online.id = null;
  online.started = false;
  setOnlineUrl(null);
}

/* =========================================================================
   ОКНО «ИГРА С ДРУГОМ»
   ========================================================================= */
function syncOnlineColorButtons() {
  document.querySelectorAll('#onlineColorRow .color-choice-btn').forEach(b => {
    const active = b.dataset.color === onlineChosenColor;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-pressed', String(active));
  });
}

function showFriendStep(step) {
  $id('friendChoiceStep').classList.toggle('hidden', step !== 'choice');
  $id('friendWaitStep').classList.toggle('hidden', step !== 'wait');
}

function openFriendModal() {
  $id('friendError').classList.add('hidden');
  $id('onlineCreateBtn').disabled = false;
  syncOnlineColorButtons();
  showFriendStep('choice');
  showModal('friendModal');
}

function showOnlineWaiting(id) {
  $id('onlineLinkInput').value = onlineGameUrl(id);
  showFriendStep('wait');
  showModal('friendModal');
}

document.querySelectorAll('#onlineColorRow .color-choice-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    playSound('ui');
    onlineChosenColor = btn.dataset.color;
    syncOnlineColorButtons();
  });
});

$id('friendLocalBtn').addEventListener('click', () => {
  playSound('ui');
  hideModal('friendModal');
  state.mode = 'friend';
  state.playerColor = 'w';
  state.aiColor = 'b';
  hideHomeScreen();
  initGame();
});

$id('friendBackBtn').addEventListener('click', () => { playSound('ui'); hideModal('friendModal'); });

$id('onlineCreateBtn').addEventListener('click', async () => {
  playSound('ui');
  const btn = $id('onlineCreateBtn');
  btn.disabled = true;
  $id('friendError').classList.add('hidden');
  const { data, error } = await sb.rpc('create_online_game', { p_color: onlineChosenColor, p_name: myOnlineName() });
  btn.disabled = false;
  const row = data?.[0];
  if (error || !row) {
    $id('friendError').textContent = t('Не удалось создать партию. Проверьте интернет и попробуйте ещё раз.');
    $id('friendError').classList.remove('hidden');
    playSound('error');
    return;
  }
  online.id = row.id;
  online.token = row.token;
  online.color = row.color;
  online.started = false;
  saveOnlineSeat(row.id, row.token, row.color);
  setOnlineUrl(row.id);
  connectOnlineChannel(row.id);
  startOnlinePolling();
  showOnlineWaiting(row.id);
  trackGoal('online_create');
});

$id('onlineShareBtn').addEventListener('click', async () => {
  playSound('ui');
  if (!online.id) return;
  const outcome = await shareOrCopy({
    title: 'chesai',
    text: t('Сыграем в шахматы? Я жду тебя за доской:'),
    url: onlineGameUrl(online.id),
  });
  if (outcome === 'copied') showToast(t('Ссылка скопирована — отправьте её другу'));
  if (outcome === 'shared' || outcome === 'copied') trackGoal('online_share', { via: outcome });
});

$id('onlineCopyBtn').addEventListener('click', async () => {
  playSound('ui');
  const input = $id('onlineLinkInput');
  try {
    await navigator.clipboard.writeText(input.value);
  } catch (e) {
    input.select();
    document.execCommand('copy');
  }
  showToast(t('Ссылка скопирована — отправьте её другу'));
});

// Отмена приглашения: партия останется в базе неначатой и удалится через 3 дня.
$id('onlineCancelBtn').addEventListener('click', () => {
  playSound('ui');
  if (online.id) forgetOnlineSeat(online.id);
  stopOnlinePolling();
  disconnectOnlineChannel();
  online.id = null;
  setOnlineUrl(null);
  hideModal('friendModal');
});

/* ---------- Приглашение по ссылке ---------- */
let pendingOnlineInvite = null;

async function openOnlineGameFromUrl() {
  const id = new URLSearchParams(location.search).get('g');
  if (id === null) return;
  if (!ONLINE_ID_RE.test(id)) { setOnlineUrl(null); showToast(t('Ссылка на партию повреждена')); return; }
  let row;
  try { row = await fetchOnlineGame(id); } catch (e) { showToast(t('Не удалось открыть партию. Проверьте интернет')); return; }
  if (!row) { setOnlineUrl(null); showToast(t('Партия по ссылке не найдена')); return; }

  const seat = readOnlineSeat(id);
  if (seat) {
    // Своя партия: создатель обновил страницу или игрок вернулся к доске
    online.id = id;
    online.token = seat.token;
    online.color = seat.color;
    online.started = false;
    connectOnlineChannel(id);
    if (row.status === 'waiting') { startOnlinePolling(); showOnlineWaiting(id); }
    else startOnlineGame(row);
    return;
  }
  if (row.status !== 'waiting') {
    setOnlineUrl(null);
    showToast(row.status === 'active' ? t('В этой партии уже играют двое') : t('Эта партия уже закончилась'));
    return;
  }
  pendingOnlineInvite = { id, row };
  const myColor = oppositeColor(row.creator_color);
  $id('onlineJoinTitle').textContent = isGuestName(row.creator_name)
    ? t('Вас зовут сыграть в шахматы')
    : t('{name} зовёт вас сыграть в шахматы', { name: row.creator_name });
  $id('onlineJoinText').textContent = myColor === 'w'
    ? t('Вы играете белыми и ходите первым. Регистрация не нужна.')
    : t('Вы играете чёрными. Регистрация не нужна.');
  $id('onlineJoinError').classList.add('hidden');
  $id('onlineJoinBtn').disabled = false;
  showModal('onlineJoinModal');
  trackGoal('online_link_open');
}

$id('onlineJoinBtn').addEventListener('click', async () => {
  playSound('ui');
  if (!pendingOnlineInvite) return;
  const { id, row } = pendingOnlineInvite;
  const btn = $id('onlineJoinBtn');
  btn.disabled = true;
  const name = myOnlineName();
  const { data, error } = await sb.rpc('join_online_game', { p_id: id, p_name: name });
  const seat = data?.[0];
  if (error || !seat) {
    btn.disabled = false;
    const code = rpcErrorCode(error);
    $id('onlineJoinError').textContent = code === 'NOT_WAITING'
      ? t('Кто-то уже занял место за доской. Попросите друга прислать новую ссылку.')
      : t('Не получилось присоединиться. Проверьте интернет и попробуйте ещё раз.');
    $id('onlineJoinError').classList.remove('hidden');
    playSound('error');
    return;
  }
  pendingOnlineInvite = null;
  online.id = id;
  online.token = seat.token;
  online.color = seat.color;
  online.started = false;
  saveOnlineSeat(id, seat.token, seat.color);
  connectOnlineChannel(id);
  sendOnlineMessage({ type: 'joined' });
  trackGoal('online_join');
  startOnlineGame({ ...row, status: 'active', joiner_name: name, moves: [] });
});

$id('onlineJoinLaterBtn').addEventListener('click', () => {
  playSound('ui');
  pendingOnlineInvite = null;
  setOnlineUrl(null);
  hideModal('onlineJoinModal');
});
