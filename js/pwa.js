// Установка chesai как приложения (PWA): регистрация service worker и
// кнопка «Установить» в настройках.
//  - Android / Chrome / Edge / Яндекс: браузер присылает beforeinstallprompt,
//    по кнопке показываем системное окно установки;
//  - iPhone / iPad: такого события нет, поэтому подсказываем путь руками
//    («Поделиться» → «На экран Домой»);
//  - уже открыто как приложение — строку прячем.
'use strict';

(function () {
  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker не зарегистрирован:', e));
    });
  }

  let deferredPrompt = null;
  const row = () => document.getElementById('installAppRow');

  function render() {
    const el = row();
    if (!el) return;
    const btn = document.getElementById('installAppBtn');
    const hint = document.getElementById('installAppHint');
    if (isStandalone()) { el.classList.add('hidden'); return; }
    if (deferredPrompt) {
      el.classList.remove('hidden');
      btn.classList.remove('hidden');
      hint.textContent = t('Иконка на рабочем столе, запуск на весь экран, движок загружается мгновенно.');
    } else if (isIos) {
      el.classList.remove('hidden');
      btn.classList.add('hidden');
      hint.textContent = t('В Safari нажмите «Поделиться», затем «На экран «Домой»».');
    } else {
      el.classList.add('hidden');
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // своя кнопка в настройках вместо навязчивой плашки браузера
    deferredPrompt = e;
    render();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    render();
    if (typeof showToast === 'function') showToast(t('Приложение установлено'));
  });

  document.addEventListener('DOMContentLoaded', () => {
    render();
    document.getElementById('installAppBtn')?.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      if (typeof playSound === 'function') playSound('ui');
      const prompt = deferredPrompt;
      deferredPrompt = null;
      prompt.prompt();
      await prompt.userChoice.catch(() => null);
      render();
    });
  });
})();
