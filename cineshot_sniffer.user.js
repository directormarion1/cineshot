// ==UserScript==
// @name         CineShot 影鏡 - 全網一鍵影視收割器
// @namespace    https://cineshot.local/
// @version      1.0.0
// @description  在任何影片網站（新片場、YouTube、B站等）一鍵懸浮按鈕或快捷鍵 Alt+S，自動將高品質商業視聽大片送入 CineShot 雲端 AI 拆解分鏡庫。
// @author       CineShot Pro
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      web-production-cafae.up.railway.app
// @connect      localhost
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (window.__cineshot_sniffer_injected) return;
  window.__cineshot_sniffer_injected = true;

  const PRIMARY_API = 'https://web-production-cafae.up.railway.app/api/ingest';
  const LOCAL_API = 'http://localhost:8765/api/ingest';

  // Inject Styles
  const style = document.createElement('style');
  style.textContent = `
    #cineshot-sniffer-btn {
      position: fixed;
      bottom: 28px;
      right: 28px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      background: rgba(15, 17, 23, 0.9);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(229, 169, 59, 0.4);
      border-radius: 9999px;
      color: #f3f4f6;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.3px;
      cursor: pointer;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 15px rgba(229, 169, 59, 0.2);
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
    }
    #cineshot-sniffer-btn:hover {
      background: rgba(26, 30, 42, 0.95);
      border-color: #e5a93b;
      transform: translateY(-2px) scale(1.02);
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7), 0 0 24px rgba(229, 169, 59, 0.45);
    }
    #cineshot-sniffer-btn .cs-shortcut {
      font-size: 10px;
      padding: 2px 6px;
      background: rgba(229, 169, 59, 0.2);
      color: #ffc453;
      border-radius: 4px;
      border: 1px solid rgba(229, 169, 59, 0.4);
      font-family: monospace;
    }
    #cineshot-toast {
      position: fixed;
      top: 30px;
      right: 30px;
      z-index: 2147483647;
      max-width: 380px;
      padding: 16px 20px;
      background: rgba(15, 17, 23, 0.95);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(229, 169, 59, 0.5);
      border-radius: 12px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(229, 169, 59, 0.25);
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: cs-slide-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .cs-toast-header { font-size: 14px; font-weight: 700; color: #e5a93b; margin-bottom: 6px; }
    .cs-toast-title { font-size: 12px; color: #e2e8f0; margin-bottom: 8px; font-weight: 500; }
    .cs-toast-body { font-size: 11px; color: #94a3b8; line-height: 1.5; }
    @keyframes cs-slide-in { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
  `;
  document.head.appendChild(style);

  let isIngesting = false;
  let floatingBtn = null;

  function showToast(status, title, message, duration = 4000) {
    let toast = document.getElementById('cineshot-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cineshot-toast';
      document.body.appendChild(toast);
    }
    const icon = status === 'success' ? '✅' : status === 'error' ? '❌' : '🎬';
    const headerText = status === 'success' ? 'CineShot 成功收錄！' : status === 'error' ? '收錄失敗' : 'CineShot 正在收錄...';
    toast.innerHTML = `
      <div class="cs-toast-header"><span>${icon}</span> <span>${headerText}</span></div>
      <div class="cs-toast-title">${title}</div>
      <div class="cs-toast-body">${message}</div>
    `;
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, duration);
  }

  function getBestVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return null;
    const playing = videos.find(v => !v.paused && !v.ended && v.currentTime > 0);
    if (playing) return playing;
    videos.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
    return videos[0];
  }

  function extractMetadata() {
    const host = window.location.hostname;
    let title = '';
    let client = '品牌專題';
    if (host.includes('xinpianchang.com')) {
      const tEl = document.querySelector('.video-info-title, .article-title, .title-wrap h1, h1');
      if (tEl) title = tEl.innerText.trim();
      const uEl = document.querySelector('.author-info .name, .user-name');
      if (uEl) client = uEl.innerText.trim();
    } else if (host.includes('youtube.com')) {
      const tEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1.title');
      if (tEl) title = tEl.innerText.trim();
      const cEl = document.querySelector('#channel-name yt-formatted-string, #owner-name a');
      if (cEl) client = cEl.innerText.trim();
    } else if (host.includes('bilibili.com')) {
      const tEl = document.querySelector('.video-title, h1.video-title');
      if (tEl) title = tEl.innerText.trim();
    }
    if (!title) title = document.title || '精選影視商業大片';
    title = title.replace(/\s*-\s*YouTube$/i, '').replace(/_哔哩哔哩_bilibili.*$/i, '').replace(/_新片场.*$/i, '').trim();
    return { title, client };
  }

  async function triggerIngestion() {
    if (isIngesting) return;
    isIngesting = true;
    const video = getBestVideo();
    const { title, client } = extractMetadata();
    const pageUrl = window.location.href;
    let videoUrl = video ? (video.currentSrc || video.src || '') : '';
    if (!videoUrl || videoUrl.startsWith('blob:')) {
      const allVideos = document.querySelectorAll('video');
      for (let i = 0; i < allVideos.length; i++) {
        const vSrc = allVideos[i].currentSrc || allVideos[i].src;
        if (vSrc && !vSrc.startsWith('blob:')) { videoUrl = vSrc; break; }
        const sEl = allVideos[i].querySelector('source');
        if (sEl && sEl.src && !sEl.src.startsWith('blob:')) { videoUrl = sEl.src; break; }
      }
    }

    let targetUrl = pageUrl;
    if (window.location.hostname.includes('xinpianchang.com')) {
      if (!videoUrl || videoUrl.startsWith('blob:')) {
        showToast('error', title, '⚠️ 新片場反爬防護：請先在畫面中點擊「播放」按鈕，讓影片開始播放後，再點擊存入！', 6000);
        isIngesting = false;
        return;
      }
      targetUrl = videoUrl;
    }

    showToast('loading', title, '⚡ 正在將影片發送至 CineShot 雲端 AI 機房...');
    const payload = JSON.stringify({ videoUrl: targetUrl, streamUrl: videoUrl, pageUrl, title, client });

    const sendRequest = (apiUrl) => new Promise((resolve) => {
      if (typeof GM_xmlhttpRequest !== 'undefined') {
        GM_xmlhttpRequest({
          method: 'POST',
          url: apiUrl,
          headers: { 'Content-Type': 'application/json' },
          data: payload,
          onload: (r) => resolve(r.status >= 200 && r.status < 300),
          onerror: () => resolve(false)
        });
      } else {
        fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
          .then(r => resolve(r.ok))
          .catch(() => resolve(false));
      }
    });

    let ok = await sendRequest(PRIMARY_API);
    if (!ok) ok = await sendRequest(LOCAL_API);

    if (ok) {
      showToast('success', title, '🎉 已成功送入 CineShot 雲端！Gemini 3.5 正在後台逐幀拉片，約 20 秒後可於首頁檢索。', 5000);
    } else {
      showToast('error', title, '無法連線到 CineShot 伺服器，請確認網路連線。', 4000);
    }
    isIngesting = false;
  }

  function createFloatingButton() {
    if (document.getElementById('cineshot-sniffer-btn')) return;
    floatingBtn = document.createElement('div');
    floatingBtn.id = 'cineshot-sniffer-btn';
    floatingBtn.innerHTML = `<span>🎬 存入 CineShot</span><span class="cs-shortcut">Alt+S</span>`;
    floatingBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerIngestion();
    });
    document.body.appendChild(floatingBtn);
  }

  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.code === 'KeyS' || e.key === 's' || e.key === 'S' || e.key === 'ß')) {
      e.preventDefault();
      triggerIngestion();
    }
  }, true);

  function checkAndAttach() {
    if (document.querySelector('video') || /xinpianchang|youtube|bilibili|vimeo/i.test(location.hostname)) {
      createFloatingButton();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndAttach);
  } else {
    checkAndAttach();
  }
  new MutationObserver(checkAndAttach).observe(document.documentElement, { childList: true, subtree: true });
})();
