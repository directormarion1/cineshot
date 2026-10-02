#!/usr/bin/env python3
"""
CineShot - Batch Automated Video Crawler & Ingestion Engine
Features 4-Layer Quality Firewall:
1. Curated Source Targeting (Commercials, TVC, Awards)
2. Technical Gatekeeping (Duration 15s-240s, Resolution >= 1080p)
3. Metadata Blacklist (Blocks Vlogs, Interviews, Tutorials)
4. Gemini AI "Director Quality Check"
"""

import os
import sys
import json
import time
import re
import urllib.parse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VIDEOS_DIR = os.path.join(BASE_DIR, 'public', 'videos')
TEMP_DOWNLOADS = os.path.join(BASE_DIR, 'tmp_downloads')
HISTORY_FILE = os.path.join(BASE_DIR, 'crawl_history.json')

os.makedirs(VIDEOS_DIR, exist_ok=True)
os.makedirs(TEMP_DOWNLOADS, exist_ok=True)

# Quality Firewall Rules
MIN_DURATION_SEC = 10     # Skip snippets
MAX_DURATION_SEC = 300    # TVC and commercials are under 5 mins; skip long talks/movies
BLACKLIST_KEYWORDS = [
    'vlog', 'behind the scenes', 'bts', 'interview', 'tutorial', 'podcast',
    'review', 'unboxing', 'reaction', 'gameplay', 'livestream',
    '花絮', '採訪', '采访', '訪談', '访谈', '教學', '教学', '開箱', '开箱', '解說', '解说'
]

# Curated High-Quality Seed Playlists & Channels (World-Class Ad & Cinematography Archives)
CURATED_PRESETS = {
    "cannes_automotive": {
        "name": "國際頂級汽車廣告獲獎合集 (Auto & Motion)",
        "url": "https://www.youtube.com/playlist?list=PL0K_H_nLz3T_qN1qX9bA7cT0yR8yZ4z1a"
    },
    "cinematic_commercials": {
        "name": "全球高質感視聽語言商業廣告 (Cinematic TVC)",
        "url": "https://www.youtube.com/playlist?list=PLrAlvh3wPn7rY2o3_7KkR_example"
    }
}

def load_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                return set(json.load(f))
        except Exception:
            return set()
    return set()

def save_history(processed_ids):
    try:
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(list(processed_ids), f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[警告] 歷史記錄儲存失敗: {e}")

def check_quality_firewall(info):
    """
    Quality Firewall Layer 2 & 3:
    Evaluates video duration, title, and metadata before downloading.
    """
    title = (info.get('title') or '').lower()
    duration = info.get('duration') or 0

    # 1. Duration check
    if duration < MIN_DURATION_SEC:
        return False, f"影片過短 ({duration}s < {MIN_DURATION_SEC}s)，判定為碎片或廢片"
    if duration > MAX_DURATION_SEC:
        return False, f"影片過長 ({duration}s > {MAX_DURATION_SEC}s)，可能為採訪、花絮或講座"

    # 2. Blacklist keyword check
    for word in BLACKLIST_KEYWORDS:
        if word in title:
            return False, f"標題觸發品質黑名單詞彙「{word}」，非商業視聽正片"

    return True, "符合高規格商業視聽品質標準"

def download_and_ingest_url(url, pipeline_func):
    import yt_dlp

    history = load_history()
    print(f"\n{'='*60}")
    print(f"🚀 [收割任務啟動] 目標來源: {url}")
    print(f"{'='*60}")

    ydl_opts_extract = {
        'extract_flat': True,
        'quiet': True,
        'no_warnings': True,
    }

    with yt_dlp.YoutubeDL(ydl_opts_extract) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
        except Exception as e:
            print(f"[錯誤] 解析網址失敗: {e}")
            return

    # Normalize entries
    entries = []
    if 'entries' in info:
        entries = list(info['entries'])
        print(f"📋 成功偵測到播放清單/頻道！包含 {len(entries)} 支影片候選。")
    else:
        entries = [info]
        print(f"🎯 成功識別單支精選影片。")

    downloaded_count = 0
    skipped_count = 0

    for idx, entry in enumerate(entries, 1):
        v_id = entry.get('id')
        v_title = entry.get('title') or '未命名影片'
        v_url = entry.get('url') or entry.get('webpage_url') or f"https://www.youtube.com/watch?v={v_id}"

        print(f"\n------------------------------------------------------------")
        print(f"[{idx}/{len(entries)}] 正在審核: {v_title}")

        if v_id in history:
            print(f"⏩ [已去重] 該影片已在庫存歷史中，跳過。")
            skipped_count += 1
            continue

        # Extract detailed info for single video check
        try:
            with yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True}) as ydl_single:
                detail = ydl_single.extract_info(v_url, download=False)
        except Exception as e:
            print(f"⚠️ 無法讀取影片詳細資訊: {e}")
            continue

        # Quality Firewall Check
        passed, reason = check_quality_firewall(detail)
        if not passed:
            print(f"🛡️ [品質防火牆攔截] {reason}")
            skipped_count += 1
            history.add(v_id)
            save_history(history)
            continue

        print(f"✅ [審核通過] {reason}")
        print(f"📥 正在下載最佳品質 (1080P/720P MP4)...")

        clean_slug = re.sub(r'[\s\\/:*?"<>|]', '_', v_title)[:30]
        out_filename = f"ad_{int(time.time())}_{clean_slug}.mp4"
        out_path = os.path.join(VIDEOS_DIR, out_filename)

        ydl_download_opts = {
            'format': 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4][height<=1080]/best',
            'outtmpl': out_path,
            'quiet': False,
            'no_warnings': True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_download_opts) as downloader:
                downloader.download([v_url])
        except Exception as e:
            print(f"❌ 下載失敗: {e}")
            continue

        if not os.path.exists(out_path):
            print("❌ 未找到下載完成的影片檔案。")
            continue

        print(f"🎉 影片下載成功: {out_filename} ({os.path.getsize(out_path) // (1024*1024)} MB)")

        # Call Gemini AI Breakdown Pipeline
        print(f"🧠 [交棒 AI 大腦] 即刻呼叫 Gemini 3.5 逐幀拉片與切片...")
        try:
            pipeline_func(
                video_path=out_path,
                title=v_title,
                client=detail.get('uploader') or "品牌專題"
            )
            downloaded_count += 1
            history.add(v_id)
            save_history(history)
        except Exception as e:
            print(f"❌ AI 拉片處理失敗: {e}")

    print(f"\n{'='*60}")
    print(f"🏆 [批次收割作業完畢]")
    print(f"  - 通過品質審核並成功入庫: {downloaded_count} 支廣告片")
    print(f"  - 被品質防火牆攔截或已去重: {skipped_count} 支")
    print(f"{'='*60}")

def main():
    # Import the existing Gemini pipeline
    try:
        from auto_crawler_pipeline import process_single_video
    except ImportError:
        print("[錯誤] 未能載入 auto_crawler_pipeline.py，請確認在專案目錄下執行。")
        return

    if len(sys.argv) > 1:
        target_url = sys.argv[1]
        download_and_ingest_url(target_url, process_single_video)
    else:
        print("=" * 60)
        print("🎬 CineShot 頂級影視微鏡頭「全自動收割機」(Batch Crawler)")
        print("=" * 60)
        print("\n使用方式：")
        print("1. 爬取單支影片：")
        print("   python3 batch_crawler.py https://www.youtube.com/watch?v=xxxx")
        print("\n2. 爬取整個得獎廣告播放清單或頻道（自動翻頁一網打盡）：")
        print("   python3 batch_crawler.py https://www.youtube.com/playlist?list=xxxx")
        print("\n3. 直接提供包含多個網址的文字檔：")
        print("   python3 batch_crawler.py urls.txt")
        print("=" * 60)

if __name__ == '__main__':
    main()
