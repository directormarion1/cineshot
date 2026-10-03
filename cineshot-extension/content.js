/**
 * CineShot (影鏡) - Universal 1-Click Video Sniffer & Batch Ingestion Assistant
 * 
 * Floating dock supports:
 *  - Single Video Ingest: "存入 CineShot" (when video is detected or Alt+S)
 *  - Batch Video Ingest: "批量收錄 (N條)" (on collection/playlist/search/profile pages)
 */

(function () {
  'use strict';

  if (window.__cineshot_sniffer_injected) return;
  window.__cineshot_sniffer_injected = true;

  // State
  var isIngesting = false;
  var isBatchIngesting = false;
  var forceShow = false; // User pressed Alt+S → always show single button
  var currentBatchVideos = [];

  // DOM Elements
  var dockEl = null;
  var singleBtn = null;
  var batchBtn = null;

  // Token helper (reads from token.js)
  function getIngestToken() {
    return typeof INGEST_TOKEN !== 'undefined' ? INGEST_TOKEN : '';
  }

  // ─── Toast Notifications ──────────────────────────────
  function showToast(status, title, message, duration) {
    duration = duration || 4500;
    var toast = document.getElementById('cineshot-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cineshot-toast';
      document.body.appendChild(toast);
    }
    toast.className = '';

    var icon = status === 'success' ? '✅' : status === 'error' ? '❌' : '🎬';
    var headerText =
      status === 'success'
        ? 'CineShot 成功收錄！'
        : status === 'error'
        ? '收錄失敗'
        : 'CineShot 處理中...';

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

  function cleanTitle(str) {
    if (!str) return '精選影視大片';
    return str
      .replace(/\s+/g, ' ')
      .replace(/\s*-\s*YouTube$/i, '')
      .replace(/_哔哩哔哩_bilibili.*$/i, '')
      .replace(/_新片场.*$/i, '')
      .replace(/\s*on Vimeo$/i, '')
      .replace(/\s*\|\s*.*$/i, '')
      .trim() || '精選影視大片';
  }

  // ─── Video Link Scraping (Batch Ingest) ─────────────────
  function extractLinkTitle(a) {
    if (!a) return '精選影片';

    // 1. Direct title attribute
    var t = (a.getAttribute('title') || '').trim();
    if (t && t.length > 1) return cleanTitle(t);

    // 2. Direct aria-label
    t = (a.getAttribute('aria-label') || '').trim();
    if (t && t.length > 1) return cleanTitle(t);

    // 3. Child with title attribute
    var childWithTitle = a.querySelector('[title]');
    if (childWithTitle) {
      t = (childWithTitle.getAttribute('title') || '').trim();
      if (t && t.length > 1) return cleanTitle(t);
    }

    // 4. Child img alt
    var img = a.querySelector('img[alt]');
    if (img) {
      t = (img.getAttribute('alt') || '').trim();
      if (t && t.length > 1) return cleanTitle(t);
    }

    // 5. Look for title elements inside a or parent card
    var titleEl = a.querySelector('.title, #video-title, h3, h4, .tit');
    if (titleEl) {
      t = (titleEl.getAttribute('title') || titleEl.innerText || '').trim();
      if (t && t.length > 1) return cleanTitle(t);
    }

    // 6. Closest card
    var card = a.closest('.bili-video-card, .video-card, ytd-rich-item-renderer, ytd-video-renderer, ytd-playlist-panel-video-renderer, .card, li, .item, .pod-item');
    if (card) {
      var cardTitleEl = card.querySelector('.bili-video-card__info--tit, #video-title, .title, h3, h4, .name');
      if (cardTitleEl) {
        t = (cardTitleEl.getAttribute('title') || cardTitleEl.innerText || '').trim();
        if (t && t.length > 1) return cleanTitle(t);
      }
    }

    // 7. a.innerText (skip if only duration/number)
    var text = (a.innerText || '').replace(/\s+/g, ' ').trim();
    if (text && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(text) && text.length > 1) {
      return cleanTitle(text);
    }

    return '精選影片';
  }

  function scanPageVideoLinks() {
    var links = document.querySelectorAll('a[href]');
    var videoMap = new Map();
    var currentUrl = window.location.href;

    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute('href');
      if (!href) continue;

      var fullUrl = '';
      try {
        fullUrl = new URL(href, window.location.href).href;
      } catch (e) {
        continue;
      }

      var key = null;
      var pageUrl = null;
      var client = '品牌客戶';

      // 1. B站: /video/(BV[a-zA-Z0-9]+)
      var biliMatch = fullUrl.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
      if (biliMatch) {
        var bvid = biliMatch[1];
        key = 'bili_' + bvid;
        pageUrl = 'https://www.bilibili.com/video/' + bvid;
        client = 'B站精選';
      }
      // 2. YouTube: watch?v= or youtu.be/
      else if (fullUrl.includes('youtube.com/watch') || fullUrl.includes('youtu.be/')) {
        var ytMatch = fullUrl.match(/(?:watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch) {
          var ytid = ytMatch[1];
          key = 'yt_' + ytid;
          pageUrl = 'https://www.youtube.com/watch?v=' + ytid;
          client = 'YouTube';
        }
      }
      // 3. 優酷: v.youku.com/v_show/id_
      else if (fullUrl.includes('v.youku.com/v_show/id_')) {
        var ykMatch = fullUrl.match(/v\.youku\.com\/v_show\/id_([a-zA-Z0-9=]+)/);
        if (ykMatch) {
          var ykid = ykMatch[1].replace('.html', '');
          key = 'youku_' + ykid;
          pageUrl = 'https://v.youku.com/v_show/id_' + ykid + '.html';
          client = '優酷';
        }
      }
      // 4. 騰訊: v.qq.com/x/cover/ or v.qq.com/x/page/
      else if (fullUrl.includes('v.qq.com/x/cover/') || fullUrl.includes('v.qq.com/x/page/')) {
        var qqMatch = fullUrl.match(/v\.qq\.com\/x\/(?:cover|page)\/(?:[a-zA-Z0-9]+\/)?([a-zA-Z0-9]+)/);
        if (qqMatch) {
          var qqid = qqMatch[1].replace('.html', '');
          key = 'qq_' + qqid;
          pageUrl = fullUrl.split('?')[0];
          client = '騰訊視頻';
        }
      }
      // 5. 通用兜底: href 含 /video/ 或 /watch
      else if (/\/video\/|\/watch/i.test(fullUrl)) {
        var clean = fullUrl.split('#')[0];
        if (clean !== currentUrl.split('#')[0] && !clean.endsWith('.js') && !clean.endsWith('.css')) {
          key = 'general_' + clean;
          pageUrl = clean;
          client = window.location.hostname.replace(/^www\./, '');
        }
      }

      if (!key || !pageUrl) continue;

      // Visibility filter: ignore strictly non-rendered links
      if (a.offsetWidth === 0 && a.offsetHeight === 0 && !a.getClientRects().length) {
        continue;
      }

      var title = extractLinkTitle(a);

      if (videoMap.has(key)) {
        // Upgrade title if current link has a longer/more descriptive title
        var existing = videoMap.get(key);
        if (
          (!existing.title || existing.title === '精選影片' || existing.title.length < title.length) &&
          title &&
          title !== '精選影片'
        ) {
          existing.title = title;
        }
      } else {
        videoMap.set(key, {
          pageUrl: pageUrl,
          title: title,
          client: client
        });
      }
    }

    return Array.from(videoMap.values());
  }

  function shouldShowBatchButton(count) {
    if (count === 0) return false;

    var href = window.location.href;
    var host = window.location.hostname;

    // B站: 存在合集側邊欄，或 URL 含合集標識
    if (host.includes('bilibili.com')) {
      var hasBiliSidebar = document.querySelector(
        '.base-video-sections-v1, .video-sections-v1, .cur-list, .video-pod, .pod-item, #multi_page, .multi-page-v1, .up-tab-list, .channel-detail-video'
      ) !== null;
      var hasBiliUrlTag = /videopod\.sections|collectiondetail|seriesdetail|medialist|season_id=|sid=|ep_id=|business_type=2/i.test(href);
      if (hasBiliSidebar || hasBiliUrlTag) {
        return count >= 1;
      }
    }

    // YouTube: URL 含 list=
    if (host.includes('youtube.com')) {
      if (/[?&]list=/i.test(href) || document.querySelector('ytd-playlist-panel-renderer, #playlist') !== null) {
        return count >= 1;
      }
    }

    // 通用: 頁面內視頻鏈接數 > 3 (覆蓋合集頁、搜索結果頁、UP主主頁、頻道頁)
    return count > 3;
  }

  // ─── Single Video Detection ───────────────────────────
  function hasRealVideo() {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      var v = videos[i];
      if (v.clientWidth < 100 || v.clientHeight < 60) continue;
      var src = v.currentSrc || v.src || '';
      if (src && src.length > 5) return true;
      if (v.querySelector('source[src]')) return true;
    }
    return false;
  }

  function getBestVideo() {
    var videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return null;

    var playing = videos.find(function (v) { return !v.paused && !v.ended && v.currentTime > 0; });
    if (playing) return playing;

    videos.sort(function (a, b) {
      return (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight);
    });
    return videos[0];
  }

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

    return { title: cleanTitle(title), client: client };
  }

  // ─── Single Video Ingestion ───────────────────────────
  async function triggerIngestion() {
    if (isIngesting) return;
    isIngesting = true;
    var targetUrl = '';

    if (singleBtn) {
      singleBtn.classList.add('cs-loading');
      singleBtn.querySelector('.cs-text').innerText = '正在嗅探傳送...';
    }

    var video = getBestVideo();
    var meta = extractMetadata();
    var pageUrl = window.location.href;

    var videoUrl = '';
    if (video) {
      videoUrl = video.currentSrc || video.src || '';
    }

    if (!videoUrl || videoUrl.startsWith('blob:')) {
      var allVideos = document.querySelectorAll('video');
      for (var i = 0; i < allVideos.length; i++) {
        var vSrc = allVideos[i].currentSrc || allVideos[i].src;
        if (vSrc && !vSrc.startsWith('blob:')) { videoUrl = vSrc; break; }
        var sEl = allVideos[i].querySelector('source');
        if (sEl && sEl.src && !sEl.src.startsWith('blob:')) { videoUrl = sEl.src; break; }
      }
    }

    // Special Protection for Xinpianchang WAF
    if (window.location.hostname.includes('xinpianchang.com')) {
      if (!videoUrl || videoUrl.startsWith('blob:')) {
        showToast('error', meta.title, '⚠️ 新片場反爬防護：請先在畫面中點擊「播放」按鈕，讓影片開始播放後，再點擊存入！', 6000);
        if (singleBtn) {
          singleBtn.classList.remove('cs-loading');
          singleBtn.querySelector('.cs-text').innerText = '存入 CineShot';
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
      } else {
        responseMsg = (response && response.error) ? response.error : '收錄失敗';
      }
    } catch (err) {
      console.error('[CineShot] Communication error:', err);
    } finally {
      if (success) {
        showToast('success', meta.title, '🎉 ' + responseMsg + '\nGemini 正在後台逐幀拉片，約 20 秒後即可檢索！', 5000);
        if (singleBtn) {
          singleBtn.classList.remove('cs-loading');
          singleBtn.classList.add('cs-success');
          singleBtn.querySelector('.cs-text').innerText = '已成功收錄！';
          setTimeout(function () {
            singleBtn.classList.remove('cs-success');
            singleBtn.querySelector('.cs-text').innerText = '存入 CineShot';
            isIngesting = false;
          }, 3000);
        } else {
          isIngesting = false;
        }
      } else {
        showToast('error', meta.title, responseMsg || '無法連線到 CineShot 伺服器，請確認網路連線。', 4500);
        if (singleBtn) {
          singleBtn.classList.remove('cs-loading');
          singleBtn.querySelector('.cs-text').innerText = '存入 CineShot';
        }
        isIngesting = false;
      }
    }
  }

  // ─── Batch Video Ingestion ────────────────────────────
  async function triggerBatchIngestion() {
    if (isBatchIngesting) return;
    var videosToIngest = currentBatchVideos.slice();
    if (!videosToIngest.length) {
      showToast('error', '批量收錄', '當前頁面未檢測到有效的可收錄影片鏈接。', 4000);
      return;
    }

    isBatchIngesting = true;
    var count = videosToIngest.length;

    if (batchBtn) {
      batchBtn.classList.add('cs-loading');
      batchBtn.querySelector('.cs-text').innerText = '正在提交 ' + count + ' 條...';
    }

    showToast('loading', '批量收錄中', '⚡ 正在將 ' + count + ' 部影片提交至 CineShot 雲端排隊...', 6000);

    var payload = {
      videos: videosToIngest.map(function (v) {
        return {
          pageUrl: v.pageUrl,
          title: v.title,
          client: v.client
        };
      })
    };

    var success = false;
    var queuedCount = count;
    var errorMsg = '';

    try {
      // 1. Try via background service worker (immune to webpage CSP)
      var response = await new Promise(function (resolve) {
        var timer = setTimeout(function () {
          resolve({ success: false, error: '後台處理響應超時' });
        }, 20000);

        chrome.runtime.sendMessage(
          { type: 'BATCH_INGEST', payload: payload },
          function (res) {
            clearTimeout(timer);
            resolve(res || { success: false, error: '無法連接擴充功能後台' });
          }
        );
      });

      if (response && response.success) {
        success = true;
        queuedCount = response.queued || count;
      } else {
        // 2. Direct fallback with token from token.js
        try {
          var token = getIngestToken();
          var directResp = await fetch('https://web-production-cafae.up.railway.app/api/batch_ingest', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CineShot-Token': token
            },
            body: JSON.stringify(payload)
          });
          if (directResp.ok) {
            var directData = await directResp.json();
            success = true;
            queuedCount = directData.queued || count;
          } else {
            errorMsg = '伺服器返回 HTTP ' + directResp.status;
          }
        } catch (fetchErr) {
          errorMsg = (response && response.error) ? response.error : fetchErr.message;
        }
      }
    } catch (err) {
      console.error('[CineShot] Batch ingestion error:', err);
      errorMsg = err.message || '連線異常';
    } finally {
      if (success) {
        showToast('success', '批量收錄成功', '已提交 ' + queuedCount + ' 條，雲端排隊處理中！', 6000);
        if (batchBtn) {
          batchBtn.classList.remove('cs-loading');
          batchBtn.classList.add('cs-success');
          batchBtn.querySelector('.cs-text').innerText = '已提交 ' + queuedCount + ' 條！';
          setTimeout(function () {
            batchBtn.classList.remove('cs-success');
            batchBtn.querySelector('.cs-text').innerText = '批量收錄 (' + currentBatchVideos.length + '條)';
            isBatchIngesting = false;
          }, 4000);
        } else {
          isBatchIngesting = false;
        }
      } else {
        showToast('error', '批量收錄失敗', errorMsg || '提交失敗，請檢查網路連線或 Token 設定。', 5000);
        if (batchBtn) {
          batchBtn.classList.remove('cs-loading');
          batchBtn.querySelector('.cs-text').innerText = '批量收錄 (' + currentBatchVideos.length + '條)';
        }
        isBatchIngesting = false;
      }
    }
  }

  // ─── Floating Dock UI ─────────────────────────────────
  function ensureDock() {
    if (dockEl && document.getElementById('cineshot-sniffer-dock')) return;

    dockEl = document.createElement('div');
    dockEl.id = 'cineshot-sniffer-dock';

    // 1. Batch Button
    batchBtn = document.createElement('div');
    batchBtn.id = 'cineshot-batch-btn';
    batchBtn.title = '一鍵批量收錄當前頁面所有視頻至 CineShot 雲端 AI 切片隊列';
    batchBtn.style.display = 'none';
    batchBtn.innerHTML =
      '<span class="cs-icon">📦</span>' +
      '<span class="cs-text">批量收錄</span>';

    batchBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      triggerBatchIngestion();
    });

    // 2. Single Button
    singleBtn = document.createElement('div');
    singleBtn.id = 'cineshot-sniffer-btn';
    singleBtn.title = '點擊或按鍵盤 Alt + S 即刻存入 CineShot 雲端分鏡庫';
    singleBtn.style.display = 'none';
    singleBtn.innerHTML =
      '<span class="cs-icon">🎬</span>' +
      '<span class="cs-text">存入 CineShot</span>' +
      '<span class="cs-shortcut">Alt+S</span>';

    singleBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      triggerIngestion();
    });

    dockEl.appendChild(batchBtn);
    dockEl.appendChild(singleBtn);
    document.body.appendChild(dockEl);
  }

  function updateDockUI() {
    ensureDock();

    // 1. Check Batch
    var batchList = scanPageVideoLinks();
    currentBatchVideos = batchList;
    var showBatch = shouldShowBatchButton(batchList.length);

    if (showBatch && batchBtn) {
      batchBtn.style.display = 'flex';
      if (!isBatchIngesting) {
        batchBtn.querySelector('.cs-text').innerText = '批量收錄 (' + batchList.length + '條)';
      }
    } else if (batchBtn) {
      batchBtn.style.display = 'none';
    }

    // 2. Check Single
    var showSingle = hasRealVideo() || forceShow;
    if (showSingle && singleBtn) {
      singleBtn.style.display = 'flex';
    } else if (singleBtn) {
      singleBtn.style.display = 'none';
    }

    // 3. Dock visibility
    if (dockEl) {
      if (showBatch || showSingle) {
        dockEl.style.display = 'flex';
      } else {
        dockEl.style.display = 'none';
      }
    }
  }

  // ─── Keyboard Shortcut: Alt + S ───────────────────────
  window.addEventListener('keydown', function (e) {
    if (e.altKey && (e.code === 'KeyS' || e.key === 's' || e.key === 'S' || e.key === 'ß')) {
      e.preventDefault();
      forceShow = true;
      ensureDock();
      if (singleBtn) singleBtn.style.display = 'flex';
      if (dockEl) dockEl.style.display = 'flex';
      triggerIngestion();
    }
  }, true);

  // ─── Reactive DOM Monitoring ──────────────────────────
  var checkDebounce = null;
  function debouncedCheck() {
    clearTimeout(checkDebounce);
    checkDebounce = setTimeout(updateDockUI, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(updateDockUI, 1000);
    });
  } else {
    setTimeout(updateDockUI, 1000);
  }

  var observer = new MutationObserver(debouncedCheck);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  console.log('🎬 [CineShot] Extension loaded with Batch Ingestion support. Press Alt+S or view collections.');
})();
