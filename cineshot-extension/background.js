/**
 * CineShot Chrome Extension - Background Service Worker
 * 
 * Runs in extension privileged background context with full host permissions.
 * Completely exempt from web-page Content Security Policy (CSP) and CORS restrictions!
 */

const PRIMARY_API = 'https://web-production-cafae.up.railway.app/api/ingest';
const LOCAL_API = 'http://localhost:8765/api/ingest';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'INGEST_VIDEO') {
    handleIngest(request.payload)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message || '連線失敗' }));
    return true; // Keep message channel open for async response
  }
});

async function handleIngest(payload) {
  console.log('[CineShot Background] 收到影片收錄請求:', payload);

  // 1. Try Railway Cloud API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const resp = await fetch(PRIMARY_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const data = await resp.json();
      console.log('[CineShot Background] 雲端 API 響應成功:', data);
      return { success: true, message: data.message || '已成功送入 CineShot 雲端拉片隊列！' };
    }
  } catch (cloudErr) {
    console.warn('[CineShot Background] 雲端 API 失敗，嘗試本機 API:', cloudErr);
  }

  // 2. Fallback to Local API
  try {
    const respLocal = await fetch(LOCAL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (respLocal.ok) {
      const data = await respLocal.json();
      return { success: true, message: data.message || '已成功送入本機 CineShot 拉片隊列！' };
    }
  } catch (localErr) {
    console.error('[CineShot Background] 本機 API 亦無法連線:', localErr);
  }

  return { success: false, error: '無法連線到 CineShot 伺服器，請確認網路連線。' };
}
