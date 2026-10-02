/**
 * CineShot (影鏡) - Universal 1-Click Video Sniffer & Ingestion Assistant
 * 
 * Works across all major video platforms (Xinpianchang, YouTube, Bilibili, Vimeo, etc.)
 * Provides:
 *  1. Ambient floating gold pill button [ 🎬 存入 CineShot ]
 *  2. Global keyboard shortcut Alt + S (Option + S on macOS)
 *  3. Direct streaming URL sniffing (bypasses WAF on Xinpianchang!)
 *  4. Instant zero-copy cloud ingestion to Railway server & local CineShot
 */

(function () {
  'use strict';

  // Prevent multiple injections in the same frame
  if (window.__cineshot_sniffer_injected) return;
  window.__cineshot_sniffer_injected = true;

  const PRIMARY_API = 'https://web-production-cafae.up.railway.app/api/ingest';
  const LOCAL_API = 'http://localhost:8765/api/ingest';

  // State
  let isIngesting = false;
  let floatingBtn = null;

  // 1. Toast Notification Utility
  function showToast(status, title, message, duration = 4000) {
    let toast = document.getElementById('cineshot-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cineshot-toast';
      document.body.appendChild(toast);
    }
    toast.className = ''; // remove hide class

    const icon = status === 'success' ? '✅' : status === 'error' ? '❌' : '🎬';
    const headerText = status === 'success' ? 'CineShot 成功收錄！' : status === 'error' ? '收錄失敗' : 'CineShot 正在收錄...';
    
    toast.innerHTML = `
      <div class="cs-toast-header">
        <span>${icon}</span>
        <span>${headerText}</span>
      </div>
      <div class="cs-toast-title">${escapeHtml(title)}</div>
      <div class="cs-toast-body">${escapeHtml(message)}</div>
    `;

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.add('cs-toast-hide');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 350);
    }, duration);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  // 2. Video Sniffer Logic
  function getBestVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return null;

    // A. Currently playing video
    const playing = videos.find(v => !v.paused && !v.ended && v.currentTime > 0);
    if (playing) return playing;

    // B. Largest visible video
    videos.sort((a, b) => {
      const areaA = a.clientWidth * a.clientHeight;
      const areaB = b.clientWidth * b.clientHeight;
      return areaB - areaA;
    });

    return videos[0];
  }

  // 3. Platform-specific metadata extraction
  function extractMetadata() {
    const host = window.location.hostname;
    let title = '';
    let client = '品牌客戶';

    // Site-specific Title & Author heuristics
    if (host.includes('xinpianchang.com')) {
      const tEl = document.querySelector('.video-info-title, .article-title, .title-wrap h1, h1');
      if (tEl) title = tEl.innerText.trim();
      const uEl = document.querySelector('.author-info .name, .user-name, .creator-name');
      if (uEl) client = uEl.innerText.trim();
    } else if (host.includes('youtube.com')) {
      const tEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1.title');
      if (tEl) title = tEl.innerText.trim();
      const cEl = document.querySelector('#channel-name yt-formatted-string, #owner-name a, ytd-channel-name');
      if (cEl) client = cEl.innerText.trim();
    } else if (host.includes('bilibili.com')) {
      const tEl = document.querySelector('.video-title, h1.video-title');
      if (tEl) title = tEl.innerText.trim();
      const uEl = document.querySelector('.up-name, .username');
      if (uEl) client = uEl.innerText.trim();
    } else if (host.includes('vimeo.com')) {
      const tEl = document.querySelector('h1.clip_info-title, h1');
      if (tEl) title = tEl.innerText.trim();
    }

    if (!title) {
      title = document.title || '精選影視商業大片';
    }

    // Clean up generic site suffixes
    title = title
      .replace(/\s*-\s*YouTube$/i, '')
      .replace(/_哔哩哔哩_bilibili.*$/i, '')
      .replace(/_新片场.*$/i, '')
      .replace(/\s*on Vimeo$/i, '')
      .replace(/\s*\|\s*.*$/i, '')
      .trim();

    return { title, client };
  }

  // 4. Ingestion Action Trigger
  async function triggerIngestion() {
    if (isIngesting) return;
    isIngesting = true;

    if (floatingBtn) {
      floatingBtn.classList.add('cs-loading');
      floatingBtn.querySelector('.cs-text').innerText = '正在嗅探傳送...';
    }

    const video = getBestVideo();
    const { title, client } = extractMetadata();
    const pageUrl = window.location.href;

    let videoUrl = '';
    if (video) {
      videoUrl = video.currentSrc || video.src || '';
    }

    // Optimization for Xinpianchang:
    // If video.currentSrc is a direct CDN mp4 (e.g. oss-xpc0.xpccdn.com), use it directly to bypass WAF!
    // For YouTube / Bilibili: pageUrl is preferred because yt-dlp has dedicated extractors for high quality.
    let targetUrl = pageUrl;
    if (window.location.hostname.includes('xinpianchang.com') && videoUrl && !videoUrl.startsWith('blob:')) {
      targetUrl = videoUrl;
    } else if (videoUrl && !videoUrl.startsWith('blob:') && !window.location.hostname.includes('youtube.com') && !window.location.hostname.includes('bilibili.com')) {
      targetUrl = videoUrl;
    }

    showToast('loading', title, '⚡ 正在將影片發送至 CineShot 雲端 AI 機房...');

    const payload = {
      videoUrl: targetUrl,
      streamUrl: videoUrl,
      pageUrl: pageUrl,
      title: title,
      client: client
    };

    let success = false;
    let responseMsg = '';

    // Step A: Send to Railway Cloud API
    try {
      const resp = await fetch(PRIMARY_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        const data = await resp.json();
        success = true;
        responseMsg = data.message || '已成功送入 CineShot 雲端拉片隊列！';
      }
    } catch (e) {
      console.warn('[CineShot] Railway API 未直達，嘗試本機 API...', e);
    }

    // Step B: Fallback to local server if railway fails
    if (!success) {
      try {
        const respLocal = await fetch(LOCAL_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (respLocal.ok) {
          const data = await respLocal.json();
          success = true;
          responseMsg = data.message || '已成功送入本機 CineShot 拉片隊列！';
        }
      } catch (err) {
        console.error('[CineShot] 連線失敗:', err);
      }
    }

    if (success) {
      showToast('success', title, `🎉 ${responseMsg}\nGemini 3.5 正在後台逐幀拉片，約 20 秒後即可在首頁檢索！`, 5000);
      if (floatingBtn) {
        floatingBtn.classList.remove('cs-loading');
        floatingBtn.classList.add('cs-success');
        floatingBtn.querySelector('.cs-text').innerText = '已成功收錄！';
        setTimeout(() => {
          floatingBtn.classList.remove('cs-success');
          floatingBtn.querySelector('.cs-text').innerText = '存入 CineShot';
          isIngesting = false;
        }, 3000);
      } else {
        isIngesting = false;
      }
    } else {
      showToast('error', title, '無法連線到 CineShot 伺服器，請確認網路連線或稍後再試。', 4000);
      if (floatingBtn) {
        floatingBtn.classList.remove('cs-loading');
        floatingBtn.querySelector('.cs-text').innerText = '存入 CineShot';
      }
      isIngesting = false;
    }
  }

  // 5. Create Floating UI Button
  function createFloatingButton() {
    if (document.getElementById('cineshot-sniffer-btn')) return;

    floatingBtn = document.createElement('div');
    floatingBtn.id = 'cineshot-sniffer-btn';
    floatingBtn.title = '點擊或按鍵盤 Alt + S 即刻存入 CineShot 雲端分鏡庫';
    floatingBtn.innerHTML = `
      <span class="cs-icon">🎬</span>
      <span class="cs-text">存入 CineShot</span>
      <span class="cs-shortcut">Alt+S</span>
    `;

    floatingBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerIngestion();
    });

    document.body.appendChild(floatingBtn);
  }

  // 6. Global Keyboard Shortcut Listener (Alt + S / Option + S)
  window.addEventListener('keydown', (e) => {
    // Check Alt + S (Mac Option + S often outputs 'ß' or 's')
    if (e.altKey && (e.code === 'KeyS' || e.key === 's' || e.key === 'S' || e.key === 'ß')) {
      e.preventDefault();
      triggerIngestion();
    }
  }, true);

  // 7. Auto-detection on DOM and URL changes
  function checkAndAttach() {
    const hasVideo = !!document.querySelector('video');
    const isVideoSite = /xinpianchang|youtube|bilibili|vimeo|adquan|digitaling/i.test(location.hostname);
    
    if (hasVideo || isVideoSite) {
      createFloatingButton();
    }
  }

  // Initial check
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndAttach);
  } else {
    checkAndAttach();
  }

  // Observe page dynamically for SPA route changes & delayed video rendering
  const observer = new MutationObserver(() => {
    checkAndAttach();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  console.log('🎬 [CineShot Sniffer] 影鏡全網一鍵收割外掛已注入！支援快捷鍵 Alt + S。');
})();
