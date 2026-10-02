/**
 * CineShot Chrome Extension - Background Service Worker
 * Runs in extension privileged context, immune to webpage CSP/CORS.
 */

const PRIMARY_API = 'https://web-production-cafae.up.railway.app/api/ingest';
const LOCAL_API = 'http://localhost:8765/api/ingest';

// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.type === 'INGEST_VIDEO') {
    handleIngest(request.payload)
      .then(function(result) { sendResponse(result); })
      .catch(function(err) { sendResponse({ success: false, error: err.message || 'Unknown error' }); });
    return true; // Keep channel open for async sendResponse
  }
  if (request.type === 'PING') {
    sendResponse({ alive: true });
    return false;
  }
});

async function handleIngest(payload) {
  console.log('[CineShot BG] Ingest request:', payload);

  // Try cloud API first
  try {
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 15000);

    var resp = await fetch(PRIMARY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (resp.ok) {
      var data = await resp.json();
      console.log('[CineShot BG] Cloud API OK:', data);
      return { success: true, message: data.message || '已成功送入 CineShot 雲端拉片隊列！' };
    }
  } catch (e) {
    console.warn('[CineShot BG] Cloud API failed, trying local:', e);
  }

  // Fallback to local API
  try {
    var respLocal = await fetch(LOCAL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (respLocal.ok) {
      var dataLocal = await respLocal.json();
      return { success: true, message: dataLocal.message || '已成功送入本機 CineShot 拉片隊列！' };
    }
  } catch (e2) {
    console.error('[CineShot BG] Local API also failed:', e2);
  }

  return { success: false, error: '無法連線到 CineShot 伺服器' };
}

// Log when service worker starts
console.log('[CineShot BG] Service worker started successfully.');
