// Запуск приложения после загрузки страницы и таймер партии. Грузится последним.
'use strict';

/* =========================================================================
   ИНИЦИАЛИЗАЦИЯ
   ========================================================================= */
document.addEventListener('visibilitychange', onHomeVisibilityChange);
document.addEventListener('DOMContentLoaded', () => {
  initStockfish();
  updateModeIcon('ai');
  initSettingsPanel();
  initMenuPanel();
  initAuth();
  initProfileView();
  initProfileEditView();
  initAchievementsView();
  initStatsView();
  initAboutView();
  initFeedbackModal();
  initPushSettings();
  showHomeScreen();
  initSupabaseSession();
  openSharedCharacterFromUrl();
  if (window.Achievements) window.Achievements.init();
});
// Регистрируем ресайз доски партии один раз на весь жизненный цикл страницы
window.addEventListener('resize', () => state.board && state.board.resize());
/* =========================================================================
   ТАЙМЕР
   ========================================================================= */
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateTimerDisplay() {
  const w = $id('timerWhite');
  const b = $id('timerBlack');
  if (w) w.textContent = state.timeLimited ? formatTime(state.timeWhite || 0) : '—';
  if (b) b.textContent = state.timeLimited ? formatTime(state.timeBlack || 0) : '—';
  // Активный игрок: подсвечиваем и таймер, и всю строку игрока
  const turn = state.game && !state.isGameOver ? state.game.turn() : null;
  document.querySelectorAll('.player-bar').forEach(bar => {
    bar.classList.toggle('is-turn', bar.dataset.side === turn);
  });
  [w, b].forEach(el => {
    if (!el) return;
    el.classList.remove('active', 'warning');
    const player = el.dataset.player;
    if (player === turn) {
      el.classList.add('active');
      const time = player === 'w' ? state.timeWhite : state.timeBlack;
      if (time <= 10) el.classList.add('warning');
    }
  });
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  state.timerRunning = false;
}

function startTimer() {
  stopTimer();
  if (!state.game || state.isGameOver) return;
  if (!state.timeLimited) {
    updateTimerDisplay();
    return;
  }
  const turn = state.game.turn();
  const timeLeft = turn === 'w' ? state.timeWhite : state.timeBlack;
  if (timeLeft <= 0) {
    handleTimeOut(turn);
    return;
  }
  state.timerRunning = true;
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    if (!state.game || state.isGameOver) {
      stopTimer();
      return;
    }
    const turnNow = state.game.turn();
    if (turnNow === 'w') {
      state.timeWhite = Math.max(0, state.timeWhite - 1);
    } else {
      state.timeBlack = Math.max(0, state.timeBlack - 1);
    }
    updateTimerDisplay();
    const left = turnNow === 'w' ? state.timeWhite : state.timeBlack;
    if (left <= 0) {
      stopTimer();
      handleTimeOut(turnNow);
    }
  }, 1000);
}

function handleTimeOut(color) {
  if (state.isGameOver) return;
  const loser = color === 'w' ? t('Белые') : t('Чёрные');
  let text;
  let outcome = 'draw';
  if (state.mode === 'friend') {
    const winner = color === 'w' ? t('Чёрные') : t('Белые');
    text = t('{loser} проиграли по времени. Победили {winner}.', { loser, winner });
    outcome = 'character_win';
  } else {
    const playerColor = state.playerColor;
    if (color === playerColor) {
      text = t('Вы проиграли по времени. Победил соперник.');
      outcome = 'character_win';
    } else {
      text = t('Время вышло у соперника. Вы победили!');
      outcome = 'player_win';
    }
  }
  state.isGameOver = true;
  stopTimer();
  updateResignButtonLabel();
  const achvOutcome = state.mode === 'friend' ? 'draw' : (outcome === 'player_win' ? 'win' : 'loss');
  reportAchievementGameEnd(achvOutcome);
  showResultModal(text, outcome, 'time', color === 'w' ? 'b' : 'w');
}

function resetTimers() {
  stopTimer();
  const minutes = state.settings.timeControl || 10;
  state.timeWhite = minutes * 60;
  state.timeBlack = minutes * 60;
  updateTimerDisplay();
  if (state.timeLimited && state.game && !state.isGameOver) {
    startTimer();
  }
}
const container = document.querySelector('.achv-grid-container');

function applySpinEffect() {
  const rect = container.getBoundingClientRect();
  const containerCenter = rect.top + rect.height / 2;
  const halfHeight = rect.height / 2;

  const cards = container.querySelectorAll('.achv-card');
  cards.forEach(card => {
    const cardRect = card.getBoundingClientRect();
    const cardCenter = cardRect.top + cardRect.height / 2;
    const offset = (cardCenter - containerCenter) / halfHeight;
    const clamped = Math.min(1, Math.max(-1, offset));

    // ---- НОВЫЙ КОД С МЁРТВОЙ ЗОНОЙ И ПЛАВНЫМ СТАРТОМ ----
    const DEAD_ZONE = 0.4;          // настройте под себя
    const MAX_ANGLE = 35;           // градусы

    // Наклоняем только карточки у нижнего края — верхние остаются плоскими.
    let factor = 0;
    if (clamped > DEAD_ZONE) {
      const rawFactor = (clamped - DEAD_ZONE) / (1 - DEAD_ZONE);
      factor = rawFactor * rawFactor; // плавный вход
    }

    if (factor === 0) {
      card.style.transform = '';
      card.style.opacity = '';
      return;
    }

    // Карточка «откидывается» назад вокруг своего верхнего края: верх стоит
    // на месте, низ уходит вглубь — проекция только уменьшается и не наезжает
    // на соседние карточки. Перспектива своя у каждой карточки, чтобы эффект
    // не зависел от позиции прокрутки контейнера.
    const angle = -factor * MAX_ANGLE;
    const opacity = 1 - factor * 0.35;

    card.style.transformOrigin = '50% 0';
    card.style.transform = `perspective(900px) rotateX(${angle}deg)`;
    card.style.opacity = opacity;
  });
}

// Обработчик прокрутки с throttle
let ticking = false;
container.addEventListener('scroll', () => {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      applySpinEffect();
      ticking = false;
    });
    ticking = true;
  }
});

// Первый расчёт
applySpinEffect();
