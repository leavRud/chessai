// chesai как мини-приложение VK (vk.com/app54890301).
// VK открывает https://chesai.ru/ во фрейме и добавляет к адресу параметры запуска
// (vk_app_id, vk_user_id, vk_platform, sign…). По ним понимаем, что мы внутри VK:
//  - «Поделиться» идёт через окна VK (сообщение, стена, история) вместо системного;
//  - ссылки на партию и персонажа ведут в мини-приложение: vk.com/app<ID>#g=… / #c=…;
//  - покупок нет: правила VK не разрешают внешнюю оплату в мини-приложениях;
//  - установка как PWA и браузерные push-уведомления внутри VK не нужны — прячем.
// Грузится сразу после utils.js, до модулей, которые разбирают ?g= и ?c=.
'use strict';

const VK_APP_ID = 54890301;
const VK_APP_URL = `https://vk.com/app${VK_APP_ID}`;
const IS_VK = (() => {
  const params = new URLSearchParams(location.search);
  if (params.get('vk_app_id') === String(VK_APP_ID)) {
    try { sessionStorage.setItem('chessIsVk', '1'); } catch (e) { /* без хранилища — только по адресу */ }
    return true;
  }
  try { return sessionStorage.getItem('chessIsVk') === '1'; } catch (e) { return false; }
})();

// Ссылка vk.com/app<ID>#g=abc передаёт во фрейм хэш #g=abc. Переносим g и c из хэша
// в обычные параметры — дальше их разбирают js/share.js и js/online.js как на сайте.
(function moveLaunchParamsFromHash() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const params = new URLSearchParams(location.search);
  let moved = false;
  for (const key of ['g', 'c']) {
    const value = hash.get(key);
    if (value && !params.has(key)) { params.set(key, value); moved = true; }
  }
  if (!moved) return;
  history.replaceState(history.state, '', `${location.pathname}?${params.toString()}`);
})();

// Ссылка, которую отправляем другу: внутри VK — в мини-приложение, на сайте — на сайт.
function appLink(param, id) {
  if (IS_VK) return `${VK_APP_URL}#${param}=${id}`;
  return `${location.origin}${location.pathname.replace(/index\.html$/, '')}?${param}=${id}`;
}
function appHomeLink() {
  return IS_VK ? VK_APP_URL : `${location.origin}${location.pathname.replace(/index\.html$/, '')}`;
}

function vkSend(method, params) {
  if (!IS_VK || !window.vkBridge) return Promise.reject(new Error('not in VK'));
  return window.vkBridge.send(method, params);
}

// Отмена в окне VK приходит ошибкой с error_data.error_reason / error_code 4
function vkCancelled(e) {
  const data = e && e.error_data;
  return !!data && (data.error_code === 4 || /cancel|denied/i.test(String(data.error_reason || '')));
}

// «Поделиться» внутри VK. files — картинка итога: публикуем историей, иначе — ссылкой.
// Возвращает то же, что shareOrCopy: 'shared' | 'cancelled' | 'failed'.
async function vkShare({ url, files }) {
  if (files && files[0]) {
    try {
      const blob = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(files[0]);
      });
      await vkSend('VKWebAppShowStoryBox', {
        background_type: 'image',
        blob,
        attachment: { text: 'go_to', type: 'url', url },
      });
      return 'shared';
    } catch (e) {
      if (vkCancelled(e)) return 'cancelled';
      // Истории недоступны (например, VK на компьютере) — делимся ссылкой
    }
  }
  try {
    await vkSend('VKWebAppShare', { link: url });
    return 'shared';
  } catch (e) {
    return vkCancelled(e) ? 'cancelled' : 'failed';
  }
}

if (IS_VK) {
  document.documentElement.classList.add('is-vk');
  trackGoal('vk_launch', { platform: new URLSearchParams(location.search).get('vk_platform') || '' });
  if (window.vkBridge) {
    window.vkBridge.send('VKWebAppInit').catch(() => {});
    // Тёмная шапка и светлые значки статус-бара — под тёмный главный экран
    window.vkBridge.send('VKWebAppSetViewSettings', { status_bar_style: 'light', action_bar_color: '#141414' }).catch(() => {});
  }
}
