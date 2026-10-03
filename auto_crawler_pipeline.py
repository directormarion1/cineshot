#!/usr/bin/env python3
"""
CineShot - Automated AI Video Ingestion & Shot Breakdown Pipeline
Fully compatible with Google Gemini 3.5 & 3.8 Flash with automatic retry backoff.
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error
import mimetypes
import shutil
import subprocess
from r2_storage import is_r2_configured, upload_file_to_r2

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')

# Persistent Volume Storage: Mount at /data on Railway
if os.path.exists('/data') and os.access('/data', os.W_OK):
    STORAGE_DIR = '/data'
elif os.path.exists('/data'):
    STORAGE_DIR = '/data'
elif os.environ.get('DATA_DIR'):
    STORAGE_DIR = os.environ.get('DATA_DIR')
else:
    STORAGE_DIR = os.path.join(BASE_DIR, 'public')

if STORAGE_DIR == '/data' or os.environ.get('DATA_DIR'):
    VIDEOS_DIR = os.path.join(STORAGE_DIR, 'videos')
    POSTERS_DIR = os.path.join(STORAGE_DIR, 'posters')
    DATA_FILE = os.path.join(STORAGE_DIR, 'clips.json')
else:
    VIDEOS_DIR = os.path.join(PUBLIC_DIR, 'videos')
    POSTERS_DIR = os.path.join(PUBLIC_DIR, 'posters')
    DATA_FILE = os.path.join(PUBLIC_DIR, 'data', 'clips.json')

TEMP_DIR = os.path.join(BASE_DIR, 'tmp_downloads')

os.makedirs(VIDEOS_DIR, exist_ok=True)
os.makedirs(POSTERS_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)

def get_video_duration(video_path):
    """Retrieve video duration in seconds via ffprobe"""
    ffprobe_bin = shutil.which('ffprobe')
    if not ffprobe_bin:
        return None
    try:
        cmd = [
            ffprobe_bin, '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            video_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=10)
        return float(res.stdout.strip())
    except Exception:
        return None

def generate_poster(video_path, start_time, poster_path):
    """Generate high quality JPG poster at start_time using ffmpeg"""
    ffmpeg_bin = shutil.which('ffmpeg')
    if not ffmpeg_bin:
        return False
    try:
        os.makedirs(os.path.dirname(poster_path), exist_ok=True)
        cmd = [
            ffmpeg_bin, '-y',
            '-ss', str(max(0, float(start_time))),
            '-i', video_path,
            '-vframes', '1',
            '-q:v', '2',
            poster_path
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        if os.path.exists(poster_path) and os.path.getsize(poster_path) > 0:
            return True
        if float(start_time) > 0:
            cmd[3] = '0'
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
            return os.path.exists(poster_path) and os.path.getsize(poster_path) > 0
    except Exception as e:
        print(f"[Poster Warning] Error generating {poster_path}: {e}")
    return False

def ensure_h264_compatibility(video_path):
    """
    Checks if video is encoded in H.264 via ffprobe.
    If not (e.g. AV1, VP9, HEVC), transcodes to H.264 (yuv420p) + AAC with faststart for Safari/iOS compatibility.
    """
    ffprobe_bin = shutil.which('ffprobe')
    ffmpeg_bin = shutil.which('ffmpeg')
    if not ffprobe_bin or not ffmpeg_bin or not os.path.exists(video_path):
        return video_path

    try:
        cmd = [
            ffprobe_bin, '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=codec_name',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            video_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=10)
        codec = res.stdout.strip().lower()
        if codec == 'h264':
            return video_path

        print(f"[Safari 相容性] 檢測到視頻編碼為 '{codec}'（非 H.264），啟動 ffmpeg 自動轉碼為 H.264 (avc1 + yuv420p + faststart)...")
        tmp_transcoded = video_path + '.h264.mp4'
        transcode_cmd = [
            ffmpeg_bin, '-y',
            '-i', video_path,
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            tmp_transcoded
        ]
        t_res = subprocess.run(transcode_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180)
        if t_res.returncode == 0 and os.path.exists(tmp_transcoded) and os.path.getsize(tmp_transcoded) > 0:
            shutil.move(tmp_transcoded, video_path)
            print(f"[Safari 相容性] 轉碼完成！視頻已升級為 Safari / iOS / Chrome 全平臺硬解格式。")
            return video_path
        else:
            if os.path.exists(tmp_transcoded):
                try:
                    os.remove(tmp_transcoded)
                except Exception:
                    pass
    except Exception as e:
        print(f"[Safari 相容性警告] 轉碼檢測異常: {e}")

    return video_path

def get_gemini_api_key():
    """Retrieve Gemini API Key from environment or .env file"""
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        env_file = os.path.join(BASE_DIR, '.env')
        if os.path.exists(env_file):
            with open(env_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('GEMINI_API_KEY='):
                        api_key = line.split('=', 1)[1].strip().strip('"').strip("'")
                        break
    return api_key

def analyze_video_with_gemini(video_path, api_key, title="商業廣告", client="品牌客戶"):
    """
    Sends video to Gemini and analyzes shot-by-shot visual treatment.
    """
    print(f"\n[AI 大腦] 正在將影片發送給 Gemini 進行多模態視聽拆解...")
    file_size = os.path.getsize(video_path)
    mime_type = mimetypes.guess_type(video_path)[0] or 'video/mp4'

    # Step 1: Upload Video via Google Files API
    upload_url = "https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=media"
    headers = {
        "Content-Type": mime_type,
        "x-goog-api-key": api_key
    }

    try:
        print("[AI 大腦] 正在向 Google 雲端上傳影片...")
        with open(video_path, 'rb') as vf:
            req = urllib.request.Request(upload_url, data=vf.read(), headers=headers)
            with urllib.request.urlopen(req, timeout=120) as resp:
                file_info = json.loads(resp.read().decode('utf-8'))
                file_uri = file_info['file']['uri']
                file_name = file_info['file']['name']
                print(f"[AI 大腦] 影片上傳成功: {file_name}")

        # Wait for video processing on Google server
        print("[AI 大腦] 等待 Google 神經網路分析影音時間軸...")
        for _ in range(20):
            get_req = urllib.request.Request(
                f"https://generativelanguage.googleapis.com/v1beta/{file_name}",
                headers={"x-goog-api-key": api_key}
            )
            with urllib.request.urlopen(get_req) as resp:
                status = json.loads(resp.read().decode('utf-8'))
                state = status.get('state')
                if state == 'ACTIVE':
                    print("[AI 大腦] 影片狀態: ACTIVE (已完全解析就緒)")
                    break
            time.sleep(3)

        # Step 2: Prompt Gemini for Shot-by-Shot Visual Breakdown with Quality Gatekeeping
        prompt = """
你是世界頂級廣告導演與攝影指導。請對這部影片進行專業審查與深度拉片拆解（Shot-by-Shot Breakdown）。

【品質守門員規則】：
如果這部影片不是專業的商業廣告、宣傳片、微電影、音樂MV或高規格電影鏡頭（例如：它是素人粗糙手機隨拍、遊戲錄屏、PPT簡報演講、日常生活Vlog等無電影美學之內容），請直接返回 {"is_cinematic": false, "shots": []}，嚴禁收錄！

【高價值微鏡頭提取】：
若判定為具備專業視聽語言的作品，請找出該影片中所有具備視覺張力、情緒氛圍或代表性動作的微鏡頭（每個鏡頭 2~5 秒）。

請嚴格輸出符合以下 JSON 格式的數據（不要有額外的 markdown 解釋）：
{
  "is_cinematic": true,
  "shots": [
    {
      "startTime": 12,
      "endTime": 15,
      "timecode": "00:12 - 00:15",
      "actionTag": "精確微動作（如：背對背牽手、拳擊肉搏交手、雨中回眸、車身夜馳、咖啡特寫）",
      "motion": "運鏡語言（如：推鏡頭 Dolly In、手持跟隨、環繞運鏡 360、低角度滑軌）",
      "lighting": "光影架設（如：逆光金色時刻、暗調雕刻光、日系清透柔光、賽博冷藍）",
      "colorTone": "調色風格（如：柯達 35mm 復古膠卷、低對比空氣感、青橙對比）",
      "mood": "情緒氛圍（如：青澀曖昧、極限壓迫、治癒溫馨、速度熱血）",
      "tags": ["關鍵詞1", "關鍵詞2", "動作名", "場景名"],
      "notes": "導演分鏡指引與鏡頭語言評價"
    }
  ]
}
"""

        gen_payload = {
            "contents": [{
                "parts": [
                    {"file_data": {"mime_type": mime_type, "file_uri": file_uri}},
                    {"text": prompt}
                ]
            }],
            "generationConfig": {
                "response_mime_type": "application/json"
            }
        }

        print("[AI 大腦] Gemini 正在逐幀拉片並進行專業品質質檢...")
        
        # Test models with automatic retry on 503
        candidate_models = ["gemini-3.5-flash", "gemini-3.8-flash"]
        for model_name in candidate_models:
            gen_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
            for attempt in range(4):
                try:
                    req = urllib.request.Request(
                        gen_url,
                        data=json.dumps(gen_payload).encode('utf-8'),
                        headers={
                            "Content-Type": "application/json",
                            "x-goog-api-key": api_key
                        }
                    )
                    with urllib.request.urlopen(req, timeout=90) as resp:
                        res_json = json.loads(resp.read().decode('utf-8'))
                        ai_text = res_json['candidates'][0]['content']['parts'][0]['text']
                        parsed_data = json.loads(ai_text)
                        
                        is_cinematic = parsed_data.get('is_cinematic', True)
                        if not is_cinematic:
                            print("🛡️ [AI 導演質檢員攔截] Gemini 判定本影片非專業級商業影視正片，已自動剔除拒絕入庫！")
                            return []

                        return parsed_data.get('shots', [])
                except urllib.error.HTTPError as e:
                    if e.code == 503:
                        print(f"[網絡提示] {model_name} 伺服器繁忙 (503)，3 秒後自動重試 (第 {attempt+1}/4 次)...")
                        time.sleep(3)
                    else:
                        print(f"[錯誤] {model_name} HTTP {e.code}: {e}")
                        break
                except Exception as e:
                    print(f"[錯誤] {model_name} 出現異常: {e}")
                    time.sleep(3)

        return []

    except Exception as e:
        print(f"[錯誤] AI 分析失敗: {e}")
        return []

def merge_shots_into_database(new_shots, video_relative_url, title, client, director="商業導演", region="全球精選", video_full_path=None):
    """Appends extracted shots into clips.json"""
    existing_clips = []
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                existing_clips = json.load(f)
        except Exception:
            existing_clips = []

    added_count = 0
    for s in new_shots:
        clip_id = f"ai_shot_{int(time.time())}_{added_count}"
        start_time = s.get('startTime', 0)
        poster_url = ""
        if video_full_path and os.path.exists(video_full_path):
            poster_name = f"{clip_id}.jpg"
            poster_dest = os.path.join(POSTERS_DIR, poster_name)
            if generate_poster(video_full_path, start_time, poster_dest):
                poster_url = f"/posters/{poster_name}"
                # If R2 is configured, upload poster
                if is_r2_configured():
                    r2_poster_url = upload_file_to_r2(
                        poster_dest,
                        f"posters/{poster_name}",
                        content_type="image/jpeg",
                        cache_control="public, max-age=31536000, immutable"
                    )
                    if r2_poster_url:
                        poster_url = r2_poster_url

        new_entry = {
            "id": clip_id,
            "title": f"{title} - ({s.get('actionTag')})",
            "client": client,
            "director": director,
            "year": 2024,
            "region": region,
            "category": "廣告片",
            "aspectRatio": "橫屏",
            "resolution": "4K",
            "duration": "1-5分鐘",
            "tier": "全球精選",
            "startTime": start_time,
            "endTime": s.get('endTime', 5),
            "timecode": s.get('timecode', f"{start_time}s - {s.get('endTime')}s"),
            "actionTag": s.get('actionTag', '精彩分鏡'),
            "motion": s.get('motion', '常規運鏡'),
            "lighting": s.get('lighting', '自然光'),
            "colorTone": s.get('colorTone', '電影級調色'),
            "mood": s.get('mood', '情緒張力'),
            "queryMatch": s.get('tags', []) + [s.get('actionTag', ''), title, client, 'AI自動分析'],
            "previewUrl": video_relative_url,
            "posterUrl": poster_url,
            "sourceUrl": title,
            "notes": s.get('notes', '由 Gemini 多模態 AI 自動深度拉片生成')
        }
        existing_clips.insert(0, new_entry)
        added_count += 1

    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(existing_clips, f, ensure_ascii=False, indent=2)

    print(f"\n🎉 成功將 {added_count} 個由 Gemini 親眼看片分析出來的微鏡頭合併入 CineShot 搜尋資料庫！")
    print(f"👉 當前資料庫總鏡頭數擴充至：{len(existing_clips)} 個")

def process_single_video(video_path, title="精選廣告", client="品牌客戶"):
    api_key = get_gemini_api_key()
    if not api_key:
        print("\n[錯誤] 未讀取到 GEMINI_API_KEY，請檢查 .env 檔案")
        return []

    # Video location
    dest_name = f"ad_{int(time.time())}.mp4"
    dest_path = os.path.join(VIDEOS_DIR, dest_name)
    
    video_path = os.path.abspath(video_path)
    if os.path.commonpath([video_path, VIDEOS_DIR]) == VIDEOS_DIR:
        video_filename = os.path.basename(video_path)
        relative_url = f"/videos/{video_filename}"
        actual_video_path = video_path
    else:
        shutil.copyfile(video_path, dest_path)
        video_filename = dest_name
        relative_url = f"/videos/{dest_name}"
        actual_video_path = dest_path

    # ffprobe duration check
    duration = get_video_duration(actual_video_path)
    if duration is not None:
        print(f"[ffprobe] 影片總時長: {duration:.2f} 秒")

    # Safari & iOS compatibility check & transcode fallback (H.264 / AAC / faststart)
    actual_video_path = ensure_h264_compatibility(actual_video_path)

    shots = analyze_video_with_gemini(actual_video_path, api_key, title, client)
    if shots:
        print(f"\n✨ [AI 拉片大成功] Gemini 共提取出 {len(shots)} 個高價值微鏡頭：")
        for idx, shot in enumerate(shots, 1):
            print(f"  #{idx:02d} [{shot.get('timecode')}] {shot.get('actionTag')} ｜ {shot.get('motion')} ｜ 光影: {shot.get('lighting')} ({shot.get('mood')})")

        # If R2 is configured, upload video to Cloudflare R2
        if is_r2_configured():
            print(f"[R2 上傳] 正在將影片上傳至 Cloudflare R2 ({video_filename})...")
            r2_v_url = upload_file_to_r2(actual_video_path, f"videos/{video_filename}", content_type="video/mp4")
            if r2_v_url:
                print(f"[R2 上傳完成] 影片公開鏈接: {r2_v_url}")
                relative_url = r2_v_url

        merge_shots_into_database(shots, relative_url, title, client, video_full_path=actual_video_path)
        return shots
    else:
        print("🛡️ [磁碟保護] 該影片未提取到有效鏡頭或被 AI 質檢員拒收，已自動清理磁碟空間。")
        if os.path.exists(dest_path) and dest_path != video_path:
            try:
                os.remove(dest_path)
            except Exception:
                pass
        return []

def main():
    print("=" * 60)
    print("🎬 CineShot AI 影片自動切片入庫流水線 (Pipeline)")
    print("=" * 60)

    if len(sys.argv) > 1:
        target = sys.argv[1]
        if os.path.exists(target):
            process_single_video(target, os.path.basename(target))
        else:
            print(f"檔案不存在: {target}")
    else:
        local_sample = os.path.join(BASE_DIR, "3971326212882015915.mp4")
        if os.path.exists(local_sample):
            print(f"找到本機廣告視頻: 3971326212882015915.mp4，啟動 AI 多模態拉片...")
            process_single_video(local_sample, "張慶導演 - 廣告腳本對焦實測片", "VideoSoon Studio")

if __name__ == '__main__':
    main()
