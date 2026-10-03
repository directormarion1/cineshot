#!/usr/bin/env python3
import os
import sys
import time
import yt_dlp
from auto_crawler_pipeline import process_single_video

TARGET_VIDEOS = [
    {"id": "y-PTC8Tn4UU", "title": "Josh Allen | We Got Now | New Balance", "client": "New Balance"},
    {"id": "vgFjd6IvO9M", "title": "Michelle Cooper | AC Runner | New Balance", "client": "New Balance"},
    {"id": "2zO58S0brzU", "title": "SC Rebel | New Balance", "client": "New Balance"},
    {"id": "snDN8mJUFeA", "title": "Quality Takes Time | New Balance", "client": "New Balance"},
    {"id": "UN1jd_u_zVs", "title": "Cooper Flagg | The 950 | New Balance", "client": "New Balance"},
]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VIDEOS_DIR = os.path.join(BASE_DIR, 'public', 'videos')

def run():
    print(f"🎬 [CineShot 高品質商業廣告自動收割] 開始處理 New Balance 官方精選商業片...")
    for idx, item in enumerate(TARGET_VIDEOS, 1):
        vid = item["id"]
        v_title = item["title"]
        v_client = item["client"]
        url = f"https://www.youtube.com/watch?v={vid}"
        
        print(f"\n==================================================")
        print(f"[{idx}/{len(TARGET_VIDEOS)}] 正在收割: {v_title}")
        print(f"==================================================")
        
        out_filename = f"nb_{vid}.mp4"
        out_path = os.path.join(VIDEOS_DIR, out_filename)
        
        if not os.path.exists(out_path):
            ydl_opts = {
                'format': 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4][height<=1080]/18/best',
                'outtmpl': out_path,
                'quiet': False,
                'no_warnings': True,
                'extractor_args': {'youtube': {'player_client': ['android', 'ios']}}
            }
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([url])
            except Exception as e:
                print(f"❌ 下載失敗 {vid}: {e}")
                continue
        else:
            print(f"📦 影片已下載: {out_filename}")
            
        if os.path.exists(out_path):
            print(f"🧠 即刻呼叫 Gemini 3.5 AI 進行微動作與視聽語言逐幀切片...")
            try:
                process_single_video(out_path, title=v_title, client=v_client)
            except Exception as e:
                print(f"❌ AI 切片處理失敗 {vid}: {e}")
        time.sleep(2)

    print("\n🏆 New Balance 商業廣告批次收割與 AI 切片全部完成！")

if __name__ == '__main__':
    run()
