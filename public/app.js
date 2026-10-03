// =========================================================
// CineShot (影鏡) - Dynamic Cinematic Search Engine Controller
// Multi-Language Support (zh-Hant, zh-Hans, en) & Zero-Leak Modal Playback
// =========================================================

let allClips = [];
let filteredClips = [];
let currentSubAction = '全部';
let currentQuery = '';
let currentLang = localStorage.getItem('cineshot_lang') || 'zh-Hant';

// Persistent Storyboard Canvas State
let canvasItems = JSON.parse(localStorage.getItem('cineshot_canvas') || '[]');

// Active Filters State
const activeFilters = {
  category: '全部',
  region: '全部',
  aspectRatio: '全部'
};

// =========================================================
// Internationalization (i18n) Dictionary
// =========================================================
const I18N = {
  'zh-Hant': {
    pageTitle: "CineShot (影鏡) | 影視分鏡與視聽語言檢索台",
    cleanSubtitle: "影視分鏡與視聽語言微鏡頭檢索台",
    cleanPlaceholder: "輸入你想檢索的畫面動作或意境（例：兩個人在交手、牽手、復古車夜馳...）",
    btnSearch: "開始檢索",
    trendingLabel: "熱門靈感：",
    trendingPill1: "🥊 兩個人在交手",
    trendingPill2: "🤝 牽手系列",
    trendingPill3: "🚗 復古老車夜馳",
    trendingPill4: "📐 導演分鏡手稿",
    cleanFooter: "本機硬解加速 · 0 延遲播放 · 視聽語言多模態檢索",
    
    navPlaceholder: "輸入畫面意境或動作...",
    navSearchBtn: "檢索",
    treatmentBoard: "提案板",
    
    filterTitle: "視聽維度過濾器",
    categoryLabel: "作品類型",
    regionLabel: "地區來源",
    aspectLabel: "畫幅規格",
    
    importTitle: "📁 導入本地影片",
    importDesc: "支援將任意 MP4 拖入即時生成分鏡切片",
    importBtn: "選擇本機 MP4",
    
    chipsTitleAll: "全部鏡頭標籤：",
    chipsTitleQuery: (q) => `「${q}」細分標籤：`,
    resultsCount: (n) => `${n} 個鏡頭`,
    
    noResultsTitle: (q) => `本地資料庫尚未收錄「${q}」的切片`,
    noResultsDesc: "商業級產品在此處將自動調用雲端爬蟲與全球影片庫抓取。您可以點擊下方快捷查看已收錄的實例鏡頭：",
    
    canvasTitle: "導演分鏡提案板",
    canvasSubtitle: "客戶對焦 Treatment",
    btnClear: "清空",
    canvasEmptyTitle: "尚未收藏分鏡鏡頭",
    canvasEmptyDesc: "點擊微鏡頭右下角的「+」號<br>將候選鏡頭加入提案板",
    canvasShots: "收錄鏡頭：",
    canvasDuration: "預計長度：",
    btnExport: "一鍵導出客戶提案冊 (PDF / 分享)",
    
    modalTimecode: "鏡頭秒數：",
    modalMotion: "運鏡軌跡：",
    modalLighting: "光影架設：",
    modalColorTone: "調色傾向：",
    modalMood: "情緒張力：",
    modalDirector: "指導導演：",
    modalNotes: "導演分鏡備註：",
    modalSource: "本機影片源：",
    modalAddBtn: "+ 加入分鏡提案板",
    
    cardInCanvas: "已在提案板",
    cardAddCanvas: "加入分鏡提案板",
    cardDirYear: (dir, yr) => `導演：${dir} (${yr})`,
    
    exportTitle: "CineShot 導演分鏡提案冊",
    exportHeading: "導演分鏡視覺提案冊 (Director's Visual Treatment)",
    exportSub: (shots, sec) => `共選錄 ${shots} 個分鏡鏡頭 ｜ 預估時長：${sec} 秒`,
    exportPrintBtn: "列印 / 存為 PDF",
    exportActionTag: "情境標籤：",
    exportSpecs: "視聽語言：",
    exportNotes: "導演備註：",
    alertEmptyCanvas: "請先點擊微鏡頭右下角「+」號加入鏡頭！",
    confirmClearCanvas: "確定清空提案板上的所有鏡頭？",
    importSuccess: (name) => `成功導入本機影片「${name}」！已加入鏡頭列表。`
  },
  'zh-Hans': {
    pageTitle: "CineShot (影镜) | 影视分镜与视听语言检索台",
    cleanSubtitle: "影视分镜与视听语言微镜头检索台",
    cleanPlaceholder: "输入你想检索的画面动作或意境（例：两个人在交手、牵手、复古车夜驰...）",
    btnSearch: "开始检索",
    trendingLabel: "热门灵感：",
    trendingPill1: "🥊 两个人在交手",
    trendingPill2: "🤝 牵手系列",
    trendingPill3: "🚗 复古老车夜驰",
    trendingPill4: "📐 导演分镜手稿",
    cleanFooter: "本机硬解加速 · 0 延迟播放 · 视听语言多模态检索",
    
    navPlaceholder: "输入画面意境或动作...",
    navSearchBtn: "检索",
    treatmentBoard: "提案板",
    
    filterTitle: "视听维度过滤器",
    categoryLabel: "作品类型",
    regionLabel: "地区来源",
    aspectLabel: "画幅规格",
    
    importTitle: "📁 导入本地视频",
    importDesc: "支持将任意 MP4 拖入即时生成分镜切片",
    importBtn: "选择本机 MP4",
    
    chipsTitleAll: "全部镜头标签：",
    chipsTitleQuery: (q) => `「${q}」细分标签：`,
    resultsCount: (n) => `${n} 个镜头`,
    
    noResultsTitle: (q) => `本地数据库尚未收录「${q}」的切片`,
    noResultsDesc: "商业级产品在此处将自动调用云端爬虫与全球影片库抓取。您可以点击下方快捷查看已收录的实例镜头：",
    
    canvasTitle: "导演分镜提案板",
    canvasSubtitle: "客户对焦 Treatment",
    btnClear: "清空",
    canvasEmptyTitle: "尚未收藏分镜镜头",
    canvasEmptyDesc: "点击微镜头右下角的「+」号<br>将候选镜头加入提案板",
    canvasShots: "收录镜头：",
    canvasDuration: "预计长度：",
    btnExport: "一键导出客户提案册 (PDF / 分享)",
    
    modalTimecode: "镜头秒数：",
    modalMotion: "运镜轨迹：",
    modalLighting: "光影架设：",
    modalColorTone: "调色倾向：",
    modalMood: "情绪张力：",
    modalDirector: "指导导演：",
    modalNotes: "导演分镜备注：",
    modalSource: "本机视频源：",
    modalAddBtn: "+ 加入分镜提案板",
    
    cardInCanvas: "已在提案板",
    cardAddCanvas: "加入分镜提案板",
    cardDirYear: (dir, yr) => `导演：${dir} (${yr})`,
    
    exportTitle: "CineShot 导演分镜提案册",
    exportHeading: "导演分镜视觉提案册 (Director's Visual Treatment)",
    exportSub: (shots, sec) => `共选录 ${shots} 个分镜镜头 ｜ 预估时长：${sec} 秒`,
    exportPrintBtn: "打印 / 存为 PDF",
    exportActionTag: "情境标签：",
    exportSpecs: "视听语言：",
    exportNotes: "导演备注：",
    alertEmptyCanvas: "请先点击微镜头右下角「+」号加入镜头！",
    confirmClearCanvas: "确定清空提案板上的所有镜头？",
    importSuccess: (name) => `成功导入本机视频「${name}」！已加入镜头列表。`
  },
  'en': {
    pageTitle: "CineShot PRO | Cinematic Visual & Storyboard Search Engine",
    cleanSubtitle: "Cinematic Micro-Shot & Visual Treatment Search Engine",
    cleanPlaceholder: "Search camera action, lighting or mood (e.g. combat, holding hands, vintage car...)",
    btnSearch: "Search",
    trendingLabel: "Trending:",
    trendingPill1: "🥊 Two people combat",
    trendingPill2: "🤝 Holding hands",
    trendingPill3: "🚗 Vintage car night drive",
    trendingPill4: "📐 Storyboard sketches",
    cleanFooter: "Hardware Accelerated · 0-Latency Playback · Multimodal Shot Retrieval",
    
    navPlaceholder: "Search visual mood or action...",
    navSearchBtn: "Search",
    treatmentBoard: "Treatment Board",
    
    filterTitle: "Cinematic Filters",
    categoryLabel: "Category",
    regionLabel: "Region",
    aspectLabel: "Aspect Ratio",
    
    importTitle: "📁 Import Local Video",
    importDesc: "Drag & drop any MP4 to generate instant micro-shot cuts",
    importBtn: "Choose MP4 File",
    
    chipsTitleAll: "All Action Tags:",
    chipsTitleQuery: (q) => `Sub-Action Tags for "${q}":`,
    resultsCount: (n) => `${n} shots`,
    
    noResultsTitle: (q) => `No indexed shots found for "${q}"`,
    noResultsDesc: "Enterprise edition will auto-crawl and index shots via cloud pipeline. Click below to explore indexed collections:",
    
    canvasTitle: "Director's Treatment Canvas",
    canvasSubtitle: "Client Pitch Deck",
    btnClear: "Clear",
    canvasEmptyTitle: "No storyboard shots collected",
    canvasEmptyDesc: "Click \"+\" on any micro-shot<br>to add it to your treatment board",
    canvasShots: "Total Shots: ",
    canvasDuration: "Total Duration: ",
    btnExport: "Export Treatment Deck (PDF / Share)",
    
    modalTimecode: "Timecode: ",
    modalMotion: "Camera Motion: ",
    modalLighting: "Lighting Setup: ",
    modalColorTone: "Color Grade: ",
    modalMood: "Mood / Tension: ",
    modalDirector: "Director: ",
    modalNotes: "Director Notes: ",
    modalSource: "Source Clip: ",
    modalAddBtn: "+ Add to Treatment Board",
    
    cardInCanvas: "In Treatment Board",
    cardAddCanvas: "Add to Treatment Board",
    cardDirYear: (dir, yr) => `Dir: ${dir} (${yr})`,
    
    exportTitle: "CineShot Director's Treatment Deck",
    exportHeading: "Director's Visual Treatment Deck",
    exportSub: (shots, sec) => `${shots} storyboard shots selected ｜ Est. Duration: ${sec}s`,
    exportPrintBtn: "Print / Save PDF",
    exportActionTag: "Action Tag: ",
    exportSpecs: "Cinematics: ",
    exportNotes: "Director Notes: ",
    alertEmptyCanvas: "Please click \"+\" on shots to add them to the canvas first!",
    confirmClearCanvas: "Are you sure you want to clear all shots from the treatment board?",
    importSuccess: (name) => `Successfully imported local video "${name}"! Added to shots.`
  }
};

// Term lookup for Categories, Regions, Aspect Ratios, and Moods
function translateTerm(term) {
  if (!term) return '';
  const termMap = {
    // Categories
    '全部': { 'zh-Hant': '全部', 'zh-Hans': '全部', 'en': 'All' },
    '廣告片': { 'zh-Hant': '廣告片', 'zh-Hans': '广告片', 'en': 'Commercial' },
    '宣傳片': { 'zh-Hant': '宣傳片', 'zh-Hans': '宣传片', 'en': 'Promo' },
    '紀錄片': { 'zh-Hant': '紀錄片', 'zh-Hans': '纪录片', 'en': 'Documentary' },
    
    // Regions
    '日本': { 'zh-Hant': '日本', 'zh-Hans': '日本', 'en': 'Japan' },
    '歐美': { 'zh-Hant': '歐美', 'zh-Hans': '欧美', 'en': 'US / Europe' },
    '內地港澳台': { 'zh-Hant': '港澳台/大陸', 'zh-Hans': '港澳台/大陆', 'en': 'Greater China' },
    '港澳台/大陸': { 'zh-Hant': '港澳台/大陸', 'zh-Hans': '港澳台/大陆', 'en': 'Greater China' },
    '全球精選': { 'zh-Hant': '全球精選', 'zh-Hans': '全球精选', 'en': 'Global Spotlight' },
    
    // Aspect Ratio
    '橫屏': { 'zh-Hant': '橫屏 (16:9)', 'zh-Hans': '横屏 (16:9)', 'en': 'Landscape (16:9)' },
    '豎屏': { 'zh-Hant': '豎屏 (9:16)', 'zh-Hans': '竖屏 (9:16)', 'en': 'Portrait (9:16)' },

    // Moods
    '緊張壓迫': { 'zh-Hant': '緊張壓迫', 'zh-Hans': '紧张压迫', 'en': 'Tense & Heavy' },
    '熱血沸騰': { 'zh-Hant': '熱血沸騰', 'zh-Hans': '热血沸腾', 'en': 'Adrenaline Rush' },
    '沉穩內斂': { 'zh-Hant': '沉穩內斂', 'zh-Hans': '沉稳内敛', 'en': 'Quiet & Deep' },
    '浪漫溫馨': { 'zh-Hant': '浪漫溫馨', 'zh-Hans': '浪漫温馨', 'en': 'Romantic & Warm' },
    '治癒溫馨': { 'zh-Hant': '治癒溫馨', 'zh-Hans': '治愈温馨', 'en': 'Healing & Warm' },
    '幽默逗趣': { 'zh-Hant': '幽默逗趣', 'zh-Hans': '幽默逗趣', 'en': 'Humorous & Fun' },
    '神秘優雅': { 'zh-Hant': '神秘優雅', 'zh-Hans': '神秘优雅', 'en': 'Mysterious & Elegant' },
    '專業嚴謹': { 'zh-Hant': '專業嚴謹', 'zh-Hans': '专业严谨', 'en': 'Professional & Precise' }
  };

  if (termMap[term] && termMap[term][currentLang]) {
    return termMap[term][currentLang];
  }
  return term;
}

// DOM References
const homeHeroClean = document.getElementById('homeHeroClean');
const workspaceView = document.getElementById('workspaceView');
const cleanSearchInput = document.getElementById('cleanSearchInput');
const btnCleanSearch = document.getElementById('btnCleanSearch');
const cleanSubtitle = document.getElementById('cleanSubtitle');
const cleanSearchBtnText = document.getElementById('cleanSearchBtnText');
const pillsLabel = document.getElementById('pillsLabel');
const pillCombat = document.getElementById('pillCombat');
const pillHands = document.getElementById('pillHands');
const pillCar = document.getElementById('pillCar');
const pillSketch = document.getElementById('pillSketch');
const cleanFooterText = document.getElementById('cleanFooterText');

const navSearchInput = document.getElementById('navSearchInput');
const btnNavSearch = document.getElementById('btnNavSearch');
const btnClearSearch = document.getElementById('btnClearSearch');
const btnReturnHome = document.getElementById('btnReturnHome');
const canvasTriggerText = document.getElementById('canvasTriggerText');

const filterPanelTitle = document.getElementById('filterPanelTitle');
const labelCategory = document.getElementById('labelCategory');
const labelRegion = document.getElementById('labelRegion');
const labelAspect = document.getElementById('labelAspect');
const importTitle = document.getElementById('importTitle');
const importDesc = document.getElementById('importDesc');
const importBtnText = document.getElementById('importBtnText');

const videoGrid = document.getElementById('videoGrid');
const resultsCount = document.getElementById('resultsCount');
const subActionsContainer = document.getElementById('subActionsContainer');
const chipsBarTitle = document.getElementById('chipsBarTitle');

const canvasDrawer = document.getElementById('canvasDrawer');
const btnToggleCanvas = document.getElementById('btnToggleCanvas');
const btnCloseCanvas = document.getElementById('btnCloseCanvas');
const btnClearCanvas = document.getElementById('btnClearCanvas');
const canvasCountBadge = document.getElementById('canvasCountBadge');
const canvasList = document.getElementById('canvasList');
const canvasEmptyState = document.getElementById('canvasEmptyState');
const canvasHeaderTitle = document.getElementById('canvasHeaderTitle');
const canvasHeaderSub = document.getElementById('canvasHeaderSub');
const canvasEmptyTitle = document.getElementById('canvasEmptyTitle');
const canvasEmptyDesc = document.getElementById('canvasEmptyDesc');
const canvasShotsLabel = document.getElementById('canvasShotsLabel');
const canvasDurationLabel = document.getElementById('canvasDurationLabel');
const canvasTotalShots = document.getElementById('canvasTotalShots');
const canvasTotalDuration = document.getElementById('canvasTotalDuration');
const btnExportPitch = document.getElementById('btnExportPitch');
const btnExportPitchText = document.getElementById('btnExportPitchText');

const clipModal = document.getElementById('clipModal');
const btnModalClose = document.getElementById('btnModalClose');
const modalBody = document.getElementById('modalBody');
const localVideoUploader = document.getElementById('localVideoUploader');

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
  setupLanguageSwitcher();
  setupHomepageListeners();
  setupWorkspaceListeners();
  setupFilterListeners();
  setupCanvasListeners();
  setupLocalVideoUploader();
  updateCanvasUI();

  // Apply initial language
  setLanguage(currentLang);

  // Load database
  await loadClips();
});

// Setup Multi-Language Switcher
function setupLanguageSwitcher() {
  const switchers = [
    document.getElementById('langSwitchHero'),
    document.getElementById('langSwitchNav')
  ];

  switchers.forEach(group => {
    if (!group) return;
    group.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.dataset.lang;
        setLanguage(lang);
      });
    });
  });
}

function setLanguage(lang) {
  if (!I18N[lang]) lang = 'zh-Hant';
  currentLang = lang;
  localStorage.setItem('cineshot_lang', lang);

  // Set document language attribute
  document.documentElement.lang = (lang === 'en' ? 'en' : (lang === 'zh-Hans' ? 'zh-Hans' : 'zh-Hant'));
  document.title = I18N[lang].pageTitle;

  // Sync active status on all switchers
  document.querySelectorAll('.lang-btn').forEach(btn => {
    if (btn.dataset.lang === lang) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update Hero elements
  if (cleanSubtitle) cleanSubtitle.textContent = I18N[lang].cleanSubtitle;
  if (cleanSearchInput) cleanSearchInput.placeholder = I18N[lang].cleanPlaceholder;
  if (cleanSearchBtnText) cleanSearchBtnText.textContent = I18N[lang].btnSearch;
  if (pillsLabel) pillsLabel.textContent = I18N[lang].trendingLabel;
  if (pillCombat) pillCombat.textContent = I18N[lang].trendingPill1;
  if (pillHands) pillHands.textContent = I18N[lang].trendingPill2;
  if (pillCar) pillCar.textContent = I18N[lang].trendingPill3;
  if (pillSketch) pillSketch.textContent = I18N[lang].trendingPill4;
  if (cleanFooterText) cleanFooterText.textContent = I18N[lang].cleanFooter;

  // Update Navbar elements
  if (navSearchInput) navSearchInput.placeholder = I18N[lang].navPlaceholder;
  if (btnNavSearch) btnNavSearch.textContent = I18N[lang].navSearchBtn;
  if (canvasTriggerText) canvasTriggerText.textContent = I18N[lang].treatmentBoard;

  // Update Filter Panel
  if (filterPanelTitle) filterPanelTitle.textContent = I18N[lang].filterTitle;
  if (labelCategory) labelCategory.textContent = I18N[lang].categoryLabel;
  if (labelRegion) labelRegion.textContent = I18N[lang].regionLabel;
  if (labelAspect) labelAspect.textContent = I18N[lang].aspectLabel;

  // Update Tag buttons text
  document.querySelectorAll('.filter-block .tag-opt').forEach(btn => {
    const rawVal = btn.dataset.val;
    btn.textContent = translateTerm(rawVal);
  });

  if (importTitle) importTitle.textContent = I18N[lang].importTitle;
  if (importDesc) importDesc.textContent = I18N[lang].importDesc;
  if (importBtnText) importBtnText.textContent = I18N[lang].importBtn;

  // Update Canvas Drawer
  if (canvasHeaderTitle) canvasHeaderTitle.textContent = I18N[lang].canvasTitle;
  if (canvasHeaderSub) canvasHeaderSub.textContent = I18N[lang].canvasSubtitle;
  if (btnClearCanvas) btnClearCanvas.textContent = I18N[lang].btnClear;
  if (canvasEmptyTitle) canvasEmptyTitle.textContent = I18N[lang].canvasEmptyTitle;
  if (canvasEmptyDesc) canvasEmptyDesc.innerHTML = I18N[lang].canvasEmptyDesc;
  if (canvasShotsLabel) canvasShotsLabel.textContent = I18N[lang].canvasShots;
  if (canvasDurationLabel) canvasDurationLabel.textContent = I18N[lang].canvasDuration;
  if (btnExportPitchText) btnExportPitchText.textContent = I18N[lang].btnExport;

  // If in workspace view, re-render results to reflect language
  if (workspaceView && workspaceView.style.display !== 'none') {
    performSearch(currentQuery);
  }
}

// Load clips dataset
async function loadClips() {
  try {
    const res = await fetch('/api/clips');
    if (res.ok) {
      allClips = await res.json();
    } else {
      const staticRes = await fetch('data/clips.json');
      allClips = await staticRes.json();
    }
  } catch (err) {
    const staticRes = await fetch('data/clips.json');
    allClips = await staticRes.json();
  }
  updateCleanPills();
}

// Dynamically refresh homepage exploration pills from real database clips
function updateCleanPills() {
  const container = document.querySelector('.clean-pills');
  if (!container || !allClips || allClips.length === 0) return;

  const tagsSet = new Set();
  const pills = [];

  // 1. Client brand pill
  const clients = [...new Set(allClips.map(c => c.client).filter(Boolean))];
  if (clients.length > 0) {
    const clientName = clients[0];
    tagsSet.add(clientName);
    pills.push({ query: clientName, label: `👟 ${clientName} 品牌大片` });
  }

  // 2. Action tags from real clips
  allClips.forEach(c => {
    if (c.actionTag && pills.length < 5) {
      const shortTag = c.actionTag.split(/[，,、\s｜]/)[0].substring(0, 10);
      if (shortTag && !tagsSet.has(shortTag)) {
        tagsSet.add(shortTag);
        let icon = '🎬';
        if (/球|傳球|投籃|運動/.test(shortTag)) icon = '⚽';
        else if (/跑|步|速/.test(shortTag)) icon = '🏃';
        else if (/車|馳/.test(shortTag)) icon = '🚗';
        else if (/特寫|眼神|回眸/.test(shortTag)) icon = '👁️';
        else if (/光|影/.test(shortTag)) icon = '💡';
        else if (/俯拍|全景|鏡頭|構圖/.test(shortTag)) icon = '📐';
        pills.push({ query: shortTag, label: `${icon} ${shortTag}` });
      }
    }
  });

  if (pills.length > 0) {
    const labelSpan = `<span class="pills-label" id="pillsLabel">${(I18N[currentLang] && I18N[currentLang].trendingLabel) || '熱門靈感：'}</span>`;
    const pillsHtml = pills.map(p => 
      `<button class="clean-pill" data-query="${p.query}">${p.label}</button>`
    ).join(' ');
    container.innerHTML = labelSpan + ' ' + pillsHtml;

    container.querySelectorAll('.clean-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        activateWorkspace(pill.dataset.query);
      });
    });
  }
}

// Switch from Clean Homepage to Workspace View
function activateWorkspace(query) {
  currentQuery = (query || '').trim();
  currentSubAction = '全部';

  homeHeroClean.style.display = 'none';
  workspaceView.style.display = 'block';
  navSearchInput.value = currentQuery;

  performSearch(currentQuery);
}

// Return to Clean Homepage
function returnToCleanHome() {
  workspaceView.style.display = 'none';
  homeHeroClean.style.display = 'flex';
  cleanSearchInput.value = '';
  cleanSearchInput.focus();
}

// Cinematic Semantic Synonyms & Visual Language Dictionary
// IMPORTANT: Each sport/activity has its OWN isolated group to prevent cross-contamination
const CINEMATIC_SYNONYMS = {
  // 動作 / 微動作
  '跳舞': ['跳舞', '舞蹈', '舞步', '街舞', '碎步', '舞動', '韻律', '律動', 'dance', 'dancing'],
  '舞蹈': ['跳舞', '舞蹈', '舞步', '街舞', '碎步', '舞動', '韻律', '律動', 'dance', 'dancing'],
  '打架': ['打架', '交手', '對打', '打鬥', '格鬥', '肉搏', '對峙', '交鋒', '拳擊', '武術', 'fight', 'combat', 'boxing'],
  '格鬥': ['打架', '交手', '對打', '打鬥', '格鬥', '肉搏', '對峙', '交鋒', '拳擊', '武術', 'fight', 'combat', 'boxing'],
  '交手': ['打架', '交手', '對打', '打鬥', '格鬥', '肉搏', '對峙', '交鋒', '拳擊', '武術', 'fight', 'combat', 'boxing'],
  '跑步': ['跑', '跑步', '奔跑', '衝刺', '慢跑', '踏步', '田徑', '跑道', '跨步', 'run', 'running', 'sprint'],
  '奔跑': ['跑', '跑步', '奔跑', '衝刺', '慢跑', '踏步', '田徑', '跑道', '跨步', 'run', 'running', 'sprint'],
  '開車': ['車', '汽車', '跑車', '夜馳', '老車', '奔馳', '漂移', '馳騁', '駕駛', '開車', '甩尾', 'car', 'drive', 'driving'],
  '車': ['車', '汽車', '跑車', '夜馳', '老車', '奔馳', '漂移', '馳騁', '駕駛', '開車', '甩尾', 'car', 'drive', 'driving'],

  // 球類運動 - 各運動完全獨立，互不交叉！
  '籃球': ['籃球', '投籃', '運球', '灌籃', '籃板', '三分球', '上籃', 'basketball', 'NBA', 'dunk'],
  '橄欖球': ['橄欖球', '達陣', '四分衛', 'football', 'NFL', 'touchdown', 'quarterback'],
  '足球': ['足球', '踢球', '射門', '盤帶', '角球', 'soccer', 'football'],
  '棒球': ['棒球', '打擊', '投球', '全壘打', 'baseball', 'MLB'],
  '傳球': ['傳球', '假動作', '控球', '持球', '拋球', '轉球', 'pass', 'ball handling'],

  '鞋': ['鞋', '跑鞋', '球鞋', '鞋帶', '鞋底', '碳板', '織網', 'shoes', 'sneaker'],
  '牽手': ['牽手', '牽', '手牽手', '握手', '相扣', '拉手', '手', 'hand', 'hands'],
  '笑': ['笑', '微笑', '笑容', '大笑', '開心', '放鬆', '幽默', 'smile', 'laugh'],
  '哭': ['哭', '流淚', '眼淚', '哭泣', '悲傷', '難過', 'cry', 'tear', 'tears'],

  // 視聽運鏡 (Camera Motion)
  '特寫': ['特寫', '微距', '細節', '面部', '近景', '特写', 'close-up', 'macro', 'detail'],
  '微距': ['特寫', '微距', '細節', '面部', '近景', '特写', 'close-up', 'macro', 'detail'],
  '推鏡頭': ['推鏡頭', '推進', '前推', '快推', '變焦', 'dolly in', 'push-in', 'snap zoom'],
  '拉鏡頭': ['拉鏡頭', '拉遠', '後拉', '拉出', 'dolly out'],
  '俯拍': ['俯拍', '俯瞰', '頂置', '頂光', '上帝視角', '垂直', 'top-down', 'overhead'],
  '仰拍': ['仰拍', '低角度', '貼地', '仰望', 'low-angle'],
  '環繞': ['環繞', '旋轉', '環形', '360', 'orbit', 'arc shot'],
  '跟拍': ['跟拍', '手持', '跟隨', '滑軌', '追隨', '呼吸感', 'follow'],

  // 光影 (Lighting)
  '逆光': ['逆光', '輪廓光', '背光', '邊緣光', '剪影', 'rim light', 'backlight'],
  '柔光': ['柔光', '漫射', '自然光', '清透', '散射光', '均勻', 'soft light'],
  '硬光': ['硬光', '高對比', '雕刻光', '直射光', '硬朗', 'hard light'],
  '暗調': ['暗調', '低調', '陰暗', '神秘', '壓抑', '火花', 'low-key', 'dark'],

  // 色彩調色 (Color Tone)
  '復古': ['復古', '膠片', '膠卷', '柯達', '顆粒', '35mm', 'vintage', 'retro', 'film'],
  '膠片': ['復古', '膠片', '膠卷', '柯達', '顆粒', '35mm', 'vintage', 'retro', 'film']
};

function expandQueryWords(query) {
  if (!query) return [];
  const qClean = query.toLowerCase().trim();
  const wordsSet = new Set([qClean]);

  // Special single-character semantic intent: '球' strictly means ball sports (NOT shoes!)
  if (qClean === '球') {
    ['球', '傳球', '投籃', '運球', '踢球', '拋球', '轉球', '控球', '持球', '籃球', '足球', '橄欖球', 'ball'].forEach(w => wordsSet.add(w));
    return Array.from(wordsSet);
  }

  // Direct synonym lookup: Only match if query contains the key or key contains query (for length >= 2)
  for (const [key, synonyms] of Object.entries(CINEMATIC_SYNONYMS)) {
    const keyMatch = (qClean === key) || (key.length >= 2 && qClean.length >= 2 && (qClean.includes(key) || key.includes(qClean)));
    const synMatch = synonyms.some(s => {
      const sLower = s.toLowerCase();
      return (qClean === sLower) || (sLower.length >= 2 && qClean.length >= 2 && (qClean.includes(sLower) || sLower.includes(qClean)));
    });

    if (keyMatch || synMatch) {
      synonyms.forEach(s => wordsSet.add(s.toLowerCase()));
    }
  }

  return Array.from(wordsSet);
}

function clipMatchesQuery(clip, expandedWords, originalQuery) {
  if (!originalQuery) return true;
  const qLower = originalQuery.toLowerCase().trim();

  // Combine ALL metadata fields into rich searchable haystack
  const haystack = [
    clip.title,
    clip.client,
    clip.actionTag,
    clip.motion,
    clip.lighting,
    clip.colorTone,
    clip.mood,
    clip.director,
    clip.notes,
    clip.sourceUrl,
    ...(clip.queryMatch || [])
  ].filter(Boolean).join(' ').toLowerCase();

  // Disambiguation for '球' (Ball Sports) vs '球鞋' (Sneakers/Shoes)
  if (qLower === '球') {
    // Strip '球鞋' so clips that only test or mention shoes do not match '球'
    const pureBallHaystack = haystack.replace(/球鞋/g, '');
    for (const word of expandedWords) {
      if (word && word !== '球鞋' && pureBallHaystack.includes(word)) {
        return true;
      }
    }
    return false;
  }

  // Direct substring of original query
  if (haystack.includes(qLower)) return true;

  // Any of expanded synonym words
  for (const word of expandedWords) {
    if (word && haystack.includes(word)) {
      return true;
    }
  }

  return false;
}

// Execute Search & Dynamic Filtering
function performSearch(query) {
  const q = (query !== undefined ? query : navSearchInput.value || '').trim();
  currentQuery = q;

  const expandedWords = expandQueryWords(q);

  // 1. Filter clips by query & synonyms across all metadata
  filteredClips = allClips.filter(clip => {
    const matchQuery = clipMatchesQuery(clip, expandedWords, q);

    // 2. Filter Dimensions
    const matchCategory = activeFilters.category === '全部' || clip.category === activeFilters.category;
    const matchRegion = activeFilters.region === '全部' || clip.region === activeFilters.region;
    const matchAspect = activeFilters.aspectRatio === '全部' || clip.aspectRatio === activeFilters.aspectRatio;
    const matchSubAction = currentSubAction === '全部' || clip.actionTag === currentSubAction;

    return matchQuery && matchCategory && matchRegion && matchAspect && matchSubAction;
  });

  // 3. Dynamically populate sub-actions strictly corresponding to query!
  populateDynamicSubActions(q);

  // 4. Render Video Grid
  renderVideoGrid(q);
}

// Generate DYNAMIC Sub-Action Tags (Strictly Context-Aware!)
function populateDynamicSubActions(query) {
  const qLower = (query || '').toLowerCase();
  chipsBarTitle.textContent = query ? I18N[currentLang].chipsTitleQuery(query) : I18N[currentLang].chipsTitleAll;

  // Extract unique action tags ONLY from clips matching the current query theme!
  const subActionsSet = new Set(['全部']);

  const relevantClips = allClips.filter(c => {
    if (!query) return true;
    const isCombat = ['交手', '對打', '打鬥', '格鬥', '肉搏', '對峙', '交鋒', 'combat', 'fight'].some(w => qLower.includes(w));
    const isHoldingHands = ['牽手', '手牽手', '相扣', '牵手', 'hand'].some(w => qLower.includes(w));
    const isCar = ['車', '汽車', '跑車', '夜馳', '车', 'car'].some(w => qLower.includes(w));
    const isStoryboard = ['分鏡', '手稿', '分镜', 'storyboard'].some(w => qLower.includes(w));

    if (isCombat && c.queryMatch.includes('交手')) return true;
    if (isHoldingHands && c.queryMatch.includes('牽手')) return true;
    if (isCar && c.queryMatch.includes('車')) return true;
    if (isStoryboard && c.queryMatch.includes('手稿')) return true;

    return (c.actionTag && c.actionTag.includes(query)) || (c.queryMatch && c.queryMatch.some(t => t.includes(qLower) || qLower.includes(t)));
  });

  relevantClips.forEach(c => {
    if (c.actionTag) subActionsSet.add(c.actionTag);
  });

  subActionsContainer.innerHTML = '';
  subActionsSet.forEach(tag => {
    const chip = document.createElement('button');
    chip.className = `chip-btn ${tag === currentSubAction ? 'active' : ''}`;
    chip.textContent = tag === '全部' ? translateTerm('全部') : tag;
    chip.addEventListener('click', () => {
      currentSubAction = tag;
      document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
      chip.classList.add('active');
      performSearch(query);
    });
    subActionsContainer.appendChild(chip);
  });
}

// Render Video Grid
function renderVideoGrid(query) {
  resultsCount.textContent = I18N[currentLang].resultsCount(filteredClips.length);
  videoGrid.innerHTML = '';

  if (filteredClips.length === 0) {
    videoGrid.innerHTML = `
      <div style="grid-column: 1/-1; background: #131419; border: 1px dashed #2E323E; border-radius: 10px; padding: 48px 24px; text-align: center;">
        <div style="font-size: 38px; margin-bottom: 12px;">🎬</div>
        <h3 style="font-size: 16px; color: #FFFFFF; margin-bottom: 8px;">${I18N[currentLang].noResultsTitle(query)}</h3>
        <p style="font-size: 13px; color: #9FA3AF; max-width: 500px; margin: 0 auto 16px auto; line-height: 1.6;">
          ${I18N[currentLang].noResultsDesc}
        </p>
        <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
          <button class="chip-btn active" onclick="activateWorkspace('兩個人在交手')">${I18N[currentLang].trendingPill1}</button>
          <button class="chip-btn active" onclick="activateWorkspace('牽手')">${I18N[currentLang].trendingPill2}</button>
          <button class="chip-btn active" onclick="activateWorkspace('車')">${I18N[currentLang].trendingPill3}</button>
          <button class="chip-btn active" onclick="activateWorkspace('分鏡手稿')">${I18N[currentLang].trendingPill4}</button>
        </div>
      </div>
    `;
    return;
  }

  filteredClips.forEach(clip => {
    const isAdded = canvasItems.some(item => item.id === clip.id);

    const card = document.createElement('div');
    card.className = 'shot-card';
    card.dataset.id = clip.id;

    card.innerHTML = `
      <div class="video-frame-wrap ${clip.posterUrl ? 'loaded' : ''}" title="點擊檢視視聽語言參數">
        <video 
          class="shot-card-video" 
          src="${clip.previewUrl}" 
          poster="${clip.posterUrl || ''}"
          playsinline 
          muted 
          preload="metadata"
          loading="lazy"
        ></video>

        <div class="overlay-top-tags">
          <span class="spec-badge">${clip.resolution}</span>
          <span class="spec-badge">${translateTerm(clip.aspectRatio)}</span>
        </div>
        <div class="overlay-region-tag">${translateTerm(clip.region)}</div>

        <div class="overlay-micro-action">${clip.actionTag}</div>
        <div class="overlay-tc-badge">${clip.timecode}</div>

        <button class="btn-card-add-canvas ${isAdded ? 'active' : ''}" title="${isAdded ? I18N[currentLang].cardInCanvas : I18N[currentLang].cardAddCanvas}" data-id="${clip.id}">
          ${isAdded ? '✓' : '+'}
        </button>
      </div>

      <div class="shot-card-body">
        <div class="shot-header-row">
          <span class="shot-title">${clip.title}</span>
          <span class="shot-client">${clip.client}</span>
        </div>

        <div class="shot-spec-chips">
          <span class="spec-chip">🎥 ${clip.motion}</span>
          <span class="spec-chip">💡 ${clip.lighting}</span>
          <span class="spec-chip">🎨 ${clip.colorTone}</span>
        </div>

        <div class="shot-footer-row">
          <span>${I18N[currentLang].cardDirYear(clip.director, clip.year)}</span>
          <span style="color: var(--amber-primary); font-weight: 600;">${translateTerm(clip.mood)}</span>
        </div>
      </div>
    `;

    // Video Timecode Control Loop (Smooth & zero seek loop storm)
    const video = card.querySelector('.shot-card-video');
    const frameWrap = card.querySelector('.video-frame-wrap');
    const start = clip.startTime || 0;
    const end = clip.endTime || 5;

    video.addEventListener('loadeddata', () => {
      frameWrap.classList.add('loaded');
    });

    video.addEventListener('timeupdate', () => {
      if (video.currentTime >= end) {
        video.currentTime = start;
      }
    });

    frameWrap.addEventListener('mouseenter', () => {
      if (video.currentTime < start || video.currentTime >= end) {
        video.currentTime = start;
      }
      video.play().catch(() => {});
    });

    frameWrap.addEventListener('mouseleave', () => {
      video.pause();
      video.currentTime = start;
    });

    frameWrap.addEventListener('click', (e) => {
      if (e.target.closest('.btn-card-add-canvas')) return;
      openDetailModal(clip);
    });

    const btnAdd = card.querySelector('.btn-card-add-canvas');
    btnAdd.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleClipInCanvas(clip, btnAdd);
    });

    videoGrid.appendChild(card);
  });
}

// Toggle Storyboard Canvas
function toggleClipInCanvas(clip, btn) {
  const existingIdx = canvasItems.findIndex(i => i.id === clip.id);
  if (existingIdx >= 0) {
    canvasItems.splice(existingIdx, 1);
    btn.classList.remove('active');
    btn.textContent = '+';
  } else {
    canvasItems.push(clip);
    btn.classList.add('active');
    btn.textContent = '✓';
    openCanvas();
  }

  localStorage.setItem('cineshot_canvas', JSON.stringify(canvasItems));
  updateCanvasUI();
}

function updateCanvasUI() {
  const count = canvasItems.length;
  canvasCountBadge.textContent = count;
  canvasTotalShots.textContent = count;
  canvasTotalDuration.textContent = `${count * 3}s`;

  if (count === 0) {
    canvasEmptyState.style.display = 'block';
    canvasList.innerHTML = '';
    canvasList.appendChild(canvasEmptyState);
    return;
  }

  canvasEmptyState.style.display = 'none';
  canvasList.innerHTML = '';

  canvasItems.forEach((item, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'canvas-card-item';
    itemEl.innerHTML = `
      <span class="canvas-card-num">#${String(index + 1).padStart(2, '0')}</span>
      <div class="canvas-card-thumb">
        <video src="${item.previewUrl}" poster="${item.posterUrl || ''}" muted loop autoplay playsinline preload="metadata" loading="lazy"></video>
      </div>
      <div class="canvas-card-meta">
        <span class="canvas-card-title">${item.title}</span>
        <span class="canvas-card-action">${item.actionTag} (${item.timecode})</span>
      </div>
      <button class="btn-card-del" title="移除" data-id="${item.id}">✕</button>
    `;

    const v = itemEl.querySelector('video');
    const start = item.startTime || 0;
    const end = item.endTime || 5;
    v.addEventListener('loadedmetadata', () => {
      v.currentTime = start;
    });
    v.addEventListener('timeupdate', () => {
      if (v.currentTime >= end) v.currentTime = start;
    });

    itemEl.querySelector('.btn-card-del').addEventListener('click', () => {
      canvasItems = canvasItems.filter(i => i.id !== item.id);
      localStorage.setItem('cineshot_canvas', JSON.stringify(canvasItems));
      updateCanvasUI();
      performSearch(currentQuery);
    });

    canvasList.appendChild(itemEl);
  });
}

function openCanvas() {
  canvasDrawer.classList.add('open');
}

function closeCanvas() {
  canvasDrawer.classList.remove('open');
}

// Detail Modal - Safe Open and Zero-Leak Close
function openDetailModal(clip) {
  // First ensure any previous video is terminated
  closeDetailModal();

  const start = clip.startTime || 0;
  const end = clip.endTime || 5;

  modalBody.innerHTML = `
    <div style="background: #000; position: relative;">
      <video id="modalVideoPlayer" src="${clip.previewUrl}" poster="${clip.posterUrl || ''}" controls playsinline preload="auto" style="width: 100%; max-height: 420px; display: block; object-fit: contain;"></video>
    </div>
    <div style="padding: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
        <div>
          <span style="font-size: 11px; font-weight: 700; color: var(--amber-primary);">${clip.client} · ${clip.year}</span>
          <h2 style="font-size: 18px; font-weight: 700; color: #FFF; margin-top: 2px;">${clip.title}</h2>
        </div>
        <span style="background: rgba(245, 158, 11, 0.2); color: var(--amber-primary); font-size: 12px; font-weight: 700; padding: 3px 8px; border-radius: 4px;">
          ${clip.actionTag}
        </span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: #111216; border: 1px solid var(--border-dim); border-radius: 6px; padding: 10px; margin-bottom: 14px; font-size: 12px; color: var(--text-dim);">
        <div><strong style="color: #FFF;">${I18N[currentLang].modalTimecode}</strong> ${clip.timecode}</div>
        <div><strong style="color: #FFF;">${I18N[currentLang].modalMotion}</strong> ${clip.motion}</div>
        <div><strong style="color: #FFF;">${I18N[currentLang].modalLighting}</strong> ${clip.lighting}</div>
        <div><strong style="color: #FFF;">${I18N[currentLang].modalColorTone}</strong> ${clip.colorTone}</div>
        <div><strong style="color: #FFF;">${I18N[currentLang].modalMood}</strong> ${translateTerm(clip.mood)}</div>
        <div><strong style="color: #FFF;">${I18N[currentLang].modalDirector}</strong> ${clip.director}</div>
      </div>

      <p style="font-size: 13px; color: var(--text-dim); line-height: 1.5; margin-bottom: 14px;">
        <strong style="color: #FFF;">${I18N[currentLang].modalNotes}</strong> ${clip.notes}
      </p>

      <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid var(--border-dim);">
        <span style="font-size: 11px; color: var(--text-muted);">${I18N[currentLang].modalSource} ${clip.sourceUrl}</span>
        <button class="btn-exec-search" onclick="window.addAndCloseModal('${clip.id}')">
          ${I18N[currentLang].modalAddBtn}
        </button>
      </div>
    </div>
  `;

  clipModal.classList.add('open');

  const mv = document.getElementById('modalVideoPlayer');
  if (mv) {
    let playAttempted = false;
    const tryPlay = () => {
      if (playAttempted) return;
      playAttempted = true;
      mv.currentTime = start;
      const p = mv.play();
      if (p !== undefined) {
        p.catch(() => {
          // Autoplay policy prevented unmuted playback, mute and play smoothly
          mv.muted = true;
          mv.play().catch(() => {});
        });
      }
    };

    mv.addEventListener('loadedmetadata', tryPlay);
    mv.addEventListener('canplay', tryPlay);

    // Loop back to start when reaching end timecode
    mv.addEventListener('timeupdate', () => {
      if (mv.currentTime >= end) {
        mv.currentTime = start;
      }
    });

    // Try playing immediately if already ready
    if (mv.readyState >= 2) {
      tryPlay();
    }
  }

  clipModal.classList.add('open');
}

// Complete modal cleanup - absolutely prevents background audio / video playback
function closeDetailModal() {
  const mv = document.getElementById('modalVideoPlayer');
  if (mv) {
    try {
      mv.pause();
      mv.removeAttribute('src'); // Unbind video stream completely
      mv.load();
    } catch (err) {}
  }
  modalBody.innerHTML = '';
  clipModal.classList.remove('open');
}

window.addAndCloseModal = (clipId) => {
  const clip = allClips.find(c => c.id === clipId);
  if (clip && !canvasItems.some(i => i.id === clip.id)) {
    canvasItems.push(clip);
    localStorage.setItem('cineshot_canvas', JSON.stringify(canvasItems));
    updateCanvasUI();
    performSearch(currentQuery);
    openCanvas();
  }
  closeDetailModal();
};

// Listeners Setup
function setupHomepageListeners() {
  cleanSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      activateWorkspace(cleanSearchInput.value);
    }
  });

  btnCleanSearch.addEventListener('click', () => {
    activateWorkspace(cleanSearchInput.value);
  });

  document.querySelectorAll('.clean-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      activateWorkspace(pill.dataset.query);
    });
  });
}

function setupWorkspaceListeners() {
  btnReturnHome.addEventListener('click', returnToCleanHome);

  navSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      currentSubAction = '全部';
      performSearch(navSearchInput.value);
    }
  });

  btnNavSearch.addEventListener('click', () => {
    currentSubAction = '全部';
    performSearch(navSearchInput.value);
  });

  btnClearSearch.addEventListener('click', () => {
    navSearchInput.value = '';
    currentSubAction = '全部';
    performSearch('');
  });
}

function setupFilterListeners() {
  document.querySelectorAll('.filter-block').forEach(block => {
    const filterKey = block.dataset.filter;
    const buttons = block.querySelectorAll('.tag-opt');

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilters[filterKey] = btn.dataset.val;
        currentSubAction = '全部';
        performSearch(currentQuery);
      });
    });
  });
}

function setupCanvasListeners() {
  btnToggleCanvas.addEventListener('click', () => {
    canvasDrawer.classList.toggle('open');
  });

  btnCloseCanvas.addEventListener('click', closeCanvas);

  btnClearCanvas.addEventListener('click', () => {
    if (confirm(I18N[currentLang].confirmClearCanvas)) {
      canvasItems = [];
      localStorage.setItem('cineshot_canvas', JSON.stringify(canvasItems));
      updateCanvasUI();
      performSearch(currentQuery);
    }
  });

  btnExportPitch.addEventListener('click', () => {
    if (canvasItems.length === 0) {
      alert(I18N[currentLang].alertEmptyCanvas);
      return;
    }

    const exportWin = window.open('', '_blank');
    const itemsHtml = canvasItems.map((item, idx) => `
      <div style="display: flex; gap: 20px; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #2E323E; break-inside: avoid;">
        <div style="font-family: monospace; font-size: 20px; font-weight: bold; color: #F59E0B; width: 44px;">#${String(idx + 1).padStart(2, '0')}</div>
        <div style="width: 240px; height: 135px; background: #000; border-radius: 6px; overflow: hidden; flex-shrink: 0;">
          ${item.posterUrl ? `<img src="${item.posterUrl}" style="width: 100%; height: 100%; object-fit: cover; display: block;" />` : `<video src="${item.previewUrl}" style="width: 100%; height: 100%; object-fit: cover;" autoplay muted loop></video>`}
        </div>
        <div style="flex: 1;">
          <div style="font-size: 16px; font-weight: bold; color: #FFF; margin-bottom: 6px;">${item.title}</div>
          <div style="font-size: 13px; color: #F59E0B; margin-bottom: 6px;">🎬 ${I18N[currentLang].exportActionTag} ${item.actionTag} (${item.timecode})</div>
          <div style="font-size: 12px; color: #9FA3AF; margin-bottom: 6px;">${I18N[currentLang].exportSpecs} ${item.motion} ｜ ${item.lighting} ｜ ${item.colorTone}</div>
          <div style="font-size: 12px; color: #646875;">${I18N[currentLang].exportNotes} ${item.notes}</div>
        </div>
      </div>
    `).join('');

    exportWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${I18N[currentLang].exportTitle}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0C0D10; color: #EDEDF0; padding: 40px; margin: 0; }
          .header { border-bottom: 2px solid #F59E0B; padding-bottom: 16px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
          @media print { body { background: #FFF; color: #000; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 style="margin: 0; font-size: 22px;">${I18N[currentLang].exportHeading}</h1>
            <div style="font-size: 13px; color: #9FA3AF; margin-top: 6px;">${I18N[currentLang].exportSub(canvasItems.length, canvasItems.length * 3)}</div>
          </div>
          <button onclick="window.print()" style="background: #F59E0B; color: #000; border: none; padding: 10px 18px; font-weight: bold; border-radius: 6px; cursor: pointer;">${I18N[currentLang].exportPrintBtn}</button>
        </div>
        ${itemsHtml}
      </body>
      </html>
    `);
    exportWin.document.close();
  });

  // Modal close handlers - thoroughly stopping background audio/playback
  btnModalClose.addEventListener('click', closeDetailModal);
  clipModal.addEventListener('click', (e) => {
    if (e.target === clipModal) closeDetailModal();
  });

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && clipModal.classList.contains('open')) {
      closeDetailModal();
    }
  });
}

function setupLocalVideoUploader() {
  localVideoUploader.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileUrl = URL.createObjectURL(file);
    const newClip = {
      id: `custom_${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ''),
      client: '本地導入',
      director: '自定義',
      year: 2024,
      region: '內地港澳台',
      category: '廣告片',
      aspectRatio: '橫屏',
      resolution: '4K',
      duration: '1-5分鐘',
      tier: '編輯精選',
      startTime: 0,
      endTime: 10,
      timecode: '00:00 - 00:10',
      actionTag: '自定義導入分鏡',
      motion: '自定義運鏡',
      lighting: '原片光影',
      colorTone: '原生調色',
      mood: '自定義情緒',
      queryMatch: ['自定義', '本地', file.name],
      previewUrl: fileUrl,
      sourceUrl: file.name,
      notes: '由用戶本地導入的即時分鏡視頻'
    };

    allClips.unshift(newClip);
    performSearch(currentQuery);
    alert(I18N[currentLang].importSuccess(file.name));
  });
}
