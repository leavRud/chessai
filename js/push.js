// Push-уведомления и серия дней.
//  - подписка браузера сохраняется в Supabase (save_push_subscription), рассылает
//    функция push-send раз в час: реванш от персонажа, партии по ссылке, серия под угрозой;
//  - разрешение спрашиваем не сразу, а своим вопросом под итогом партии и переключателем
//    в настройках: отказ в системном окне браузер запоминает навсегда;
//  - серия — сколько дней подряд сыграна хотя бы одна партия (считает база по game_history).
'use strict';

const PUSH_ASK_KEY = 'chessPushAskedAt';
const PUSH_ASK_PAUSE = 7 * 24 * 3600 * 1000;
const STREAK_TOAST_KEY = 'chessStreakToastDay';

function pushSupported() {
  // Внутри VK браузерные push не нужны (и во фрейме ненадёжны)
  return !IS_VK && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    && location.protocol !== 'file:';
}

function userTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow'; } catch (e) { return 'Europe/Moscow'; }
}

function urlB64ToUint8Array(base64) {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64.length + 3) % 4);
  return Uint8Array.from(atob(padded), ch => ch.charCodeAt(0));
}

async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

async function savePushSubscription(sub) {
  const j = sub.toJSON();
  const { error } = await sb.rpc('save_push_subscription', {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
    p_tz: userTimeZone(), p_lang: uiLang === 'en' ? 'en' : 'ru',
  });
  if (error) throw error;
}

// Включить уведомления. Вызывать из обработчика нажатия: системное окно
// разрешения браузер покажет только в ответ на действие игрока.
async function enablePush() {
  if (!pushSupported()) return false;
  if (!chatSignedIn) {
    openAuthModal(t('Войдите, чтобы получать уведомления'));
    return false;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    if (permission === 'denied') showToast(t('Уведомления запрещены в настройках браузера'));
    return false;
  }
  try {
    const { data: key } = await sb.rpc('get_push_public_key');
    if (!key) throw new Error('no key');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) });
    await savePushSubscription(sub);
    trackGoal('push_enable');
    showToast(t('Уведомления включены'));
    return true;
  } catch (e) {
    console.error('Не удалось включить уведомления:', e);
    showToast(t('Не удалось включить уведомления'));
    return false;
  }
}

async function disablePush() {
  const sub = await currentPushSubscription();
  if (!sub) return;
  try { await sb.rpc('delete_push_subscription', { p_endpoint: sub.endpoint }); } catch (e) { /* подписка всё равно умрёт */ }
  await sub.unsubscribe().catch(() => {});
  trackGoal('push_disable');
}

// После входа (или смены аккаунта на этом браузере) подписка переезжает на текущий аккаунт,
// заодно обновляется часовой пояс.
async function syncPushSubscription() {
  if (!chatSignedIn || !pushSupported() || Notification.permission !== 'granted') return;
  const sub = await currentPushSubscription();
  if (sub) savePushSubscription(sub).catch(() => {});
  renderPushToggle();
}

/* ---- Переключатель в настройках ---- */
async function renderPushToggle() {
  const group = $id('pushSettingsGroup');
  if (!group) return;
  if (!pushSupported()) { group.classList.add('hidden'); return; }
  group.classList.remove('hidden');
  const sub = await currentPushSubscription().catch(() => null);
  $id('pushToggle').checked = !!(sub && chatSignedIn && Notification.permission === 'granted');
}

function initPushSettings() {
  const toggle = $id('pushToggle');
  if (!toggle) return;
  toggle.addEventListener('change', async () => {
    playSound('ui');
    toggle.disabled = true;
    if (toggle.checked) toggle.checked = await enablePush();
    else await disablePush();
    toggle.disabled = false;
    renderPushToggle();
  });
  renderPushToggle();
  // Пришли из уведомления — считаем открытие (кампания = вид уведомления)
  const params = new URLSearchParams(location.search);
  if (params.get('utm_source') === 'push') trackGoal('push_open', { kind: params.get('utm_campaign') || '' });
}

/* ---- Вопрос под итогом партии ---- */
function hidePushAsk() {
  $id('pushAskBlock')?.classList.add('hidden');
}

function maybeShowPushAsk() {
  const block = $id('pushAskBlock');
  if (!block) return;
  block.classList.add('hidden');
  if (!pushSupported() || !chatSignedIn || Notification.permission !== 'default') return;
  if (state.mode === 'friend') return;
  let askedAt = 0;
  try { askedAt = Number(localStorage.getItem(PUSH_ASK_KEY)) || 0; } catch (e) { /* без хранилища — спрашиваем */ }
  if (Date.now() - askedAt < PUSH_ASK_PAUSE) return;
  $id('pushAskText').textContent = state.mode === 'characters' && state.character
    ? t('Сообщить, когда «{name}» захочет реванш?', { name: state.character.name })
    : t('Напоминать вечером, чтобы не прервать серию дней?');
  block.classList.remove('hidden');
}

function rememberPushAsked() {
  try { localStorage.setItem(PUSH_ASK_KEY, String(Date.now())); } catch (e) { /* спросим ещё раз */ }
}

$id('pushAskYes')?.addEventListener('click', async () => {
  playSound('ui');
  rememberPushAsked();
  hidePushAsk();
  await enablePush();
  renderPushToggle();
});
$id('pushAskNo')?.addEventListener('click', () => {
  playSound('ui');
  rememberPushAsked();
  hidePushAsk();
  trackGoal('push_ask_later');
});

/* =========================================================================
   СЕРИЯ ДНЕЙ
   ========================================================================= */
async function fetchPlayStreak() {
  if (!chatSignedIn) return null;
  const { data, error } = await sb.rpc('get_play_streak', { p_tz: userTimeZone() });
  return error ? null : (data?.[0] || null);
}

function formatStreak(n) {
  return `${n} ${plural(n, 'день', 'дня', 'дней')}`;
}

function renderProfileStreak() {
  const el = $id('profileStatStreak');
  if (!el) return;
  fetchPlayStreak().then(s => { el.textContent = s ? formatStreak(s.streak) : '—'; });
}

// Партия сохранилась в аккаунт: первая за день продлевает серию — хвалим один раз в день.
async function onGameSavedForStreak() {
  const s = await fetchPlayStreak();
  if (!s || s.streak < 2) return;
  const today = new Date().toLocaleDateString('sv-SE');
  try {
    if (localStorage.getItem(STREAK_TOAST_KEY) === today) return;
    localStorage.setItem(STREAK_TOAST_KEY, today);
  } catch (e) { return; }
  // Чуть позже, чтобы не спорить со звуком и тостами конца партии
  setTimeout(() => showToast(t('Серия: {days} подряд! Загляните завтра, чтобы её продолжить', { days: formatStreak(s.streak) })), 2500);
  trackGoal('streak_continue', { days: s.streak });
}
