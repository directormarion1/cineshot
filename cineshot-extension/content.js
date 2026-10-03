/**
 * CineShot (影鏡) - Universal 1-Click Video Sniffer & Ingestion Assistant
 * 
 * Floating button ONLY appears when:
 *  - A real <video> element with valid src is playing or visible on the page
 *  - User presses Alt+S (then button stays visible for rest of session)
 *  - Page is a known video site AND has video elements
 */

(function () {
  'use strict';

  if (window.__cineshot_sniffer_injected) return;
  window.__cineshot_sniffer_injected = true;

  // State
  var isIngesting = false;
  var floatingBtn = null;
  var forceShow = false; // User pressed Alt+S → always show button

  // ─── Toast ────────────────────────────────────────────
  function showToast(status, title, message, duration) {
    duration = duration || 4000;
    var toast = document.getElementById('cineshot-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cineshot-toast';
      document.body.appendChild(toast);
    }
    toast.className = '';

    var icon = status === 'success' ? '✅' : status === 'error' ? '❌' : '🎬';
    var headerText = status === 'success' ? 'CineShot 成功收錄！' : status === 'error' ? '收錄失敗' : 'CineShot 正在收錄...';

    toast.innerHTML =
      '<div class="cs-toast-header"><span>' + icon + '</span><span>' + headerText + '</span></div>' +
      '<div class="cs-toast-title">' + escapeHtml(title) + '</div>' +
      '<div class="cs-toast-body">' + escapeHtml(message) + '</div>';

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(function () {
      toast.classList.add('cs-toast-hide');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 350);
    }, duration);
  }

  function escapeHtml(str) {
    if (!str) return '';
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return str.replace(/[&<>"']/g, function (m) { return map[m]; });
  }

  // ─── Video Detection ──────────────────────────────────
  function hasRealVideo() {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      var v = videos[i];
      // Must be visible (not tiny ad tracker pixels)
      if (v.clientWidth < 100 || v.clientHeight < 60) continue;
      // Must have a real src (not empty, not just a blob from ads)
      var src = v.currentSrc || v.src || '';
      if (src && src.length > 5) return true;
      // Also check if it has source children
      if (v.querySelector('source[src]')) return true;
    }
    return false;
  }

  function getBestVideo() {
    var videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return null;

    // Prefer currently playing video
    var playing = videos.find(function (v) { return !v.paused && !v.ended && v.currentTime > 0; });
    if (playing) return playing;

    // Largest visible video
    videos.sort(function (a, b) {
      return (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight);
    });
    return videos[0];
  }

  // ─── Metadata Extraction ──────────────────────────────
  function extractMetadata() {
    var host = window.location.hostname;
    var title = '';
    var client = '品牌客戶';

    if (host.includes('xinpianchang.com')) {
      var tEl = document.querySelector('.video-info-title, .article-title, .title-wrap h1, h1');
      if (tEl) title = tEl.innerText.trim();
      var uEl = document.querySelector('.author-info .name, .user-name, .creator-name');
      if (uEl) client = uEl.innerText.trim();
    } else if (host.includes('youtube.com')) {
      var tEl2 = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1.title');
      if (tEl2) title = tEl2.innerText.trim();
      var cEl = document.querySelector('#channel-name yt-formatted-string, #owner-name a, ytd-channel-name');
      if (cEl) client = cEl.innerText.trim();
    } else if (host.includes('bilibili.com')) {
      var tEl3 = document.querySelector('.video-title, h1.video-title');
      if (tEl3) title = tEl3.innerText.trim();
      var uEl2 = document.querySelector('.up-name, .username');
      if (uEl2) client = uEl2.innerText.trim();
    } else if (host.includes('vimeo.com')) {
      var tEl4 = document.querySelector('h1.clip_info-title, h1');
      if (tEl4) title = tEl4.innerText.trim();
    }

    if (!title) {
      title = document.title || '精選影視商業大片';
    }

    title = title
      .replace(/\s*-\s*YouTube$/i, '')
      .replace(/_哔哩哔哩_bilibili.*$/i, '')
      .replace(/_新片场.*$/i, '')
      .replace(/\s*on Vimeo$/i, '')
      .replace(/\s*\|\s*.*$/i, '')
      .trim();

    return { title: title, client: client };
  }

  // ─── Ingestion ────────────────────────────────────────
  async function triggerIngestion() {
    if (isIngesting) return;
    isIngesting = true;
    var targetUrl = '';

    if (floatingBtn) {
      floatingBtn.classList.add('cs-loading');
      floatingBtn.querySelector('.cs-text').innerText = '正在嗅探傳送...';
    }

    var video = getBestVideo();
    var meta = extractMetadata();
    var pageUrl = window.location.href;

    var videoUrl = '';
    if (video) {
      videoUrl = video.currentSrc || video.src || '';
    }

    // Comprehensive scan for video sources if primary video is empty
    if (!videoUrl || videoUrl.startsWith('blob:')) {
      var allVideos = document.querySelectorAll('video');
      for (var i = 0; i < allVideos.length; i++) {
        var vSrc = allVideos[i].currentSrc || allVideos[i].src;
        if (vSrc && !vSrc.startsWith('blob:')) { videoUrl = vSrc; break; }
        var sEl = allVideos[i].querySelector('source');
        if (sEl && sEl.src && !sEl.src.startsWith('blob:')) { videoUrl = sEl.src; break; }
      }
    }

    // Special Protection for Xinpianchang (Anti-Scraping WAF)
    // Direct CDN video stream is REQUIRED because Railway server cannot crawl the HTML page directly
    if (window.location.hostname.includes('xinpianchang.com')) {
      if (!videoUrl || videoUrl.startsWith('blob:')) {
        showToast('error', meta.title, '⚠️ 新片場反爬防護：請先在畫面中點擊「播放」按鈕，讓影片開始播放後，再點擊存入！', 6000);
        if (floatingBtn) {
          floatingBtn.classList.remove('cs-loading');
          floatingBtn.querySelector('.cs-text').innerText = '存入 CineShot';
        }
        isIngesting = false;
        return;
      }
      targetUrl = videoUrl;
    } else if (videoUrl && !videoUrl.startsWith('blob:') &&
      !window.location.hostname.includes('youtube.com') &&
      !window.location.hostname.includes('bilibili.com')) {
      targetUrl = videoUrl;
    }

    showToast('loading', meta.title, '⚡ 正在將影片發送至 CineShot 雲端 AI 機房...');

    var cleanStreamUrl = (videoUrl && !videoUrl.startsWith('blob:')) ? videoUrl : '';
    var cleanVideoUrl = (targetUrl && !targetUrl.startsWith('blob:')) ? targetUrl : '';

    var payload = {
      videoUrl: cleanVideoUrl,
      streamUrl: cleanStreamUrl,
      pageUrl: pageUrl,
      title: meta.title,
      client: meta.client
    };

    var success = false;
    var responseMsg = '';

    try {
      var response = await new Promise(function (resolve) {
        var timer = setTimeout(function () {
          resolve({ success: false, error: '伺服器響應超時' });
        }, 15000);

        chrome.runtime.sendMessage(
          { type: 'INGEST_VIDEO', payload: payload },
          function (res) {
            clearTimeout(timer);
            resolve(res || { success: false, error: '擴充功能後台連線超時' });
          }
        );
      });

      if (response && response.success) {
        success = true;
        responseMsg = response.message || '已成功送入 CineShot 雲端拉片隊列！';
      }
    } catch (err) {
      console.error('[CineShot] Communication error:', err);
    } finally {
      if (success) {
        showToast('success', meta.title, '🎉 ' + responseMsg + '\nGemini 正在後台逐幀拉片，約 20 秒後即可檢索！', 5000);
        if (floatingBtn) {
          floatingBtn.classList.remove('cs-loading');
          floatingBtn.classList.add('cs-success');
          floatingBtn.querySelector('.cs-text').innerText = '已成功收錄！';
          setTimeout(function () {
            floatingBtn.classList.remove('cs-success');
            floatingBtn.querySelector('.cs-text').innerText = '存入 CineShot';
            isIngesting = false;
          }, 3000);
        } else {
          isIngesting = false;
        }
      } else {
        showToast('error', meta.title, (response && response.error) ? ('收錄失敗: ' + response.error) : '無法連線到 CineShot 伺服器，請確認網路連線。', 4500);
        if (floatingBtn) {
          floatingBtn.classList.remove('cs-loading');
          floatingBtn.querySelector('.cs-text').innerText = '存入 CineShot';
        }
        isIngesting = false;
      }
    }
  }

  // ─── Floating Button ──────────────────────────────────
  function createFloatingButton() {
    if (document.getElementById('cineshot-sniffer-btn')) return;

    floatingBtn = document.createElement('div');
    floatingBtn.id = 'cineshot-sniffer-btn';
    floatingBtn.title = '點擊或按鍵盤 Alt + S 即刻存入 CineShot 雲端分鏡庫';
    floatingBtn.innerHTML =
      '<span class="cs-icon">🎬</span>' +
      '<span class="cs-text">存入 CineShot</span>' +
      '<span class="cs-shortcut">Alt+S</span>';

    floatingBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      triggerIngestion();
    });

    document.body.appendChild(floatingBtn);
  }

  function removeFloatingButton() {
    var btn = document.getElementById('cineshot-sniffer-btn');
    if (btn) {
      btn.parentNode.removeChild(btn);
      floatingBtn = null;
    }
  }

  // ─── Keyboard Shortcut: Alt + S ───────────────────────
  window.addEventListener('keydown', function (e) {
    if (e.altKey && (e.code === 'KeyS' || e.key === 's' || e.key === 'S' || e.key === 'ß')) {
      e.preventDefault();
      // Force show the button on Alt+S even if no video detected
      forceShow = true;
      createFloatingButton();
      triggerIngestion();
    }
  }, true);

  // ─── Smart Detection: Only show on pages with real video ──
  var checkDebounce = null;

  function checkAndAttach() {
    // If user already pressed Alt+S, always keep button
    if (forceShow) {
      createFloatingButton();
      return;
    }

    if (hasRealVideo()) {
      createFloatingButton();
    } else {
      removeFloatingButton();
    }
  }

  function debouncedCheck() {
    clearTimeout(checkDebounce);
    checkDebounce = setTimeout(checkAndAttach, 500);
  }

  // Initial check after page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(checkAndAttach, 1000);
    });
  } else {
    setTimeout(checkAndAttach, 1000);
  }

  // Observe DOM changes (debounced to avoid performance hit)
  var observer = new MutationObserver(debouncedCheck);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  console.log('🎬 [CineShot] Extension injected. Press Alt+S or wait for video detection.');
})();
