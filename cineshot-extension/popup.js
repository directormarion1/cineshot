const INGEST_TOKEN = ''; // Set to match INGEST_TOKEN on server if configured

document.addEventListener('DOMContentLoaded', () => {
  const btnIngest = document.getElementById('btn-ingest');
  const btnOpen = document.getElementById('btn-open-cineshot');
  const urlInput = document.getElementById('manual-url');
  const msgEl = document.getElementById('msg');

  // Pre-fill current tab URL if it looks like a video URL
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].url) {
      const url = tabs[0].url;
      if (/xinpianchang|youtube|bilibili|vimeo/i.test(url)) {
        urlInput.value = url;
      }
    }
  });

  btnOpen.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://web-production-cafae.up.railway.app' });
  });

  btnIngest.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
      msgEl.innerText = '請先輸入或貼上影片網址！';
      msgEl.style.color = '#ef4444';
      return;
    }

    btnIngest.disabled = true;
    btnIngest.innerText = '正在傳送...';
    msgEl.innerText = '⚡ 正在發送至 CineShot 雲端機房...';
    msgEl.style.color = '#e5a93b';

    try {
      const resp = await fetch('https://web-production-cafae.up.railway.app/api/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CineShot-Token': INGEST_TOKEN
        },
        body: JSON.stringify({
          videoUrl: url,
          pageUrl: url,
          title: '手動收錄影片',
          client: '品牌專題'
        })
      });

      if (resp.ok) {
        msgEl.innerText = '🎉 成功加入拉片排程！Gemini 3.5 正在處理。';
        msgEl.style.color = '#10b981';
      } else {
        msgEl.innerText = '伺服器響應異常，請稍後再試。';
        msgEl.style.color = '#ef4444';
      }
    } catch (e) {
      msgEl.innerText = '連線失敗，請檢查網路。';
      msgEl.style.color = '#ef4444';
    } finally {
      btnIngest.disabled = false;
      btnIngest.innerHTML = '<span>⚡ 立即傳送至雲端 AI 拉片</span>';
    }
  });
});
