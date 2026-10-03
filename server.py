#!/usr/bin/env python3
"""
FramePulse (CineShot PRO) - Cinematic Shot Intelligence Server
Pure Python 3 - Full HTTP 206 Range Streaming Support with robust error handling.
"""

import os
import sys
import json
import shutil
import mimetypes
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import posixpath
import urllib.parse
import urllib.request
import threading
import time
import re
import socket
import ipaddress
import subprocess

PORT = int(os.environ.get('PORT', 8765))
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

INGEST_TOKEN = os.environ.get('INGEST_TOKEN', '')
INGEST_TASKS = {}

def backfill_posters():
    """Generate missing posters for existing clips in DATA_FILE using ffmpeg"""
    ffmpeg_bin = shutil.which('ffmpeg')
    if not ffmpeg_bin or not os.path.exists(DATA_FILE):
        return
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            clips = json.load(f)
        updated = False
        for c in clips:
            if not isinstance(c, dict): continue
            clip_id = c.get('id')
            poster_url = c.get('posterUrl')
            poster_name = f"{clip_id}.jpg"
            poster_path = os.path.join(POSTERS_DIR, poster_name)

            if not poster_url or not os.path.exists(poster_path):
                preview = c.get('previewUrl', '')
                if preview.startswith('/videos/'):
                    v_name = preview[len('/videos/'):].lstrip('/')
                    v_path = os.path.join(VIDEOS_DIR, v_name)
                    if os.path.exists(v_path):
                        start_time = max(0, float(c.get('startTime', 0)))
                        cmd = [
                            ffmpeg_bin, '-y',
                            '-ss', str(start_time),
                            '-i', v_path,
                            '-vframes', '1',
                            '-q:v', '2',
                            poster_path
                        ]
                        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
                        if os.path.exists(poster_path) and os.path.getsize(poster_path) > 0:
                            c['posterUrl'] = f"/posters/{poster_name}"
                            updated = True
        if updated:
            with open(DATA_FILE, 'w', encoding='utf-8') as f:
                json.dump(clips, f, ensure_ascii=False, indent=2)
            print(f"[Poster Backfill] Generated missing posters for clips in {DATA_FILE}")
    except Exception as e:
        print(f"[Poster Backfill Warning] {e}")

def init_storage():
    """Ensure persistent volume is initialized and incrementally sync new files from image"""
    os.makedirs(VIDEOS_DIR, exist_ok=True)
    os.makedirs(POSTERS_DIR, exist_ok=True)

    # 1. Sync clips.json: seed if missing, or merge newly pushed clips by id
    src_clips = os.path.join(PUBLIC_DIR, 'data', 'clips.json')
    if os.path.exists(src_clips) and os.path.abspath(src_clips) != os.path.abspath(DATA_FILE):
        try:
            os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
            if not os.path.exists(DATA_FILE):
                shutil.copyfile(src_clips, DATA_FILE)
                print(f"[Volume Init] Copied initial clips.json to {DATA_FILE}")
            else:
                with open(src_clips, 'r', encoding='utf-8') as sf, open(DATA_FILE, 'r', encoding='utf-8') as df:
                    src_data = json.load(sf)
                    dst_data = json.load(df)
                existing_ids = {c.get('id') for c in dst_data if isinstance(c, dict)}
                new_clips = [c for c in src_data if isinstance(c, dict) and c.get('id') not in existing_ids]
                if new_clips:
                    dst_data.extend(new_clips)
                    with open(DATA_FILE, 'w', encoding='utf-8') as df:
                        json.dump(dst_data, df, ensure_ascii=False, indent=2)
                    print(f"[Volume Init] Incremental sync: merged {len(new_clips)} new clips into {DATA_FILE}")
        except Exception as e:
            print(f"[Volume Init Warning] Failed to sync clips.json: {e}")

    # 2. Incremental sync for videos: copy any file in public/videos that is missing in VIDEOS_DIR
    src_videos_dir = os.path.join(PUBLIC_DIR, 'videos')
    if os.path.exists(src_videos_dir) and os.path.abspath(src_videos_dir) != os.path.abspath(VIDEOS_DIR):
        try:
            copied_count = 0
            for fname in os.listdir(src_videos_dir):
                if fname.startswith('.'):
                    continue
                s_file = os.path.join(src_videos_dir, fname)
                d_file = os.path.join(VIDEOS_DIR, fname)
                if os.path.isfile(s_file) and not os.path.exists(d_file):
                    shutil.copyfile(s_file, d_file)
                    copied_count += 1
            if copied_count > 0:
                print(f"[Volume Init] Incremental sync: copied {copied_count} new video(s) into {VIDEOS_DIR}")
            else:
                total_videos = len([f for f in os.listdir(VIDEOS_DIR) if not f.startswith('.')])
                print(f"[Volume Init] Persistent storage up-to-date ({total_videos} videos in {VIDEOS_DIR}).")
        except Exception as e:
            print(f"[Volume Init Warning] Failed to incrementally sync videos: {e}")

    # 3. Incremental sync for posters: copy any file in public/posters that is missing in POSTERS_DIR
    src_posters_dir = os.path.join(PUBLIC_DIR, 'posters')
    if os.path.exists(src_posters_dir) and os.path.abspath(src_posters_dir) != os.path.abspath(POSTERS_DIR):
        try:
            for fname in os.listdir(src_posters_dir):
                if fname.startswith('.'): continue
                s_file = os.path.join(src_posters_dir, fname)
                d_file = os.path.join(POSTERS_DIR, fname)
                if os.path.isfile(s_file) and not os.path.exists(d_file):
                    shutil.copyfile(s_file, d_file)
        except Exception as e:
            print(f"[Volume Init Warning] Failed to incrementally sync posters: {e}")

    # 4. Generate missing posters for clips
    backfill_posters()

def get_bilibili_stream(bvid):
    """Fetch high-quality direct mp4 stream for Bilibili videos via official player API"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/'
    }
    view_url = f'https://api.bilibili.com/x/web-interface/view?bvid={bvid}'
    req = urllib.request.Request(view_url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        v_data = json.loads(resp.read().decode('utf-8'))
        if v_data.get('code') != 0:
            raise Exception(f"Bilibili view API: {v_data.get('message')}")
        cid = v_data['data']['cid']
        title = v_data['data'].get('title', 'B站精選短片')
        owner = v_data['data'].get('owner', {}).get('name', 'B站創作者')

    play_url = f'https://api.bilibili.com/x/player/playurl?bvid={bvid}&cid={cid}&qn=64&fnval=1'
    req2 = urllib.request.Request(play_url, headers=headers)
    with urllib.request.urlopen(req2, timeout=30) as resp:
        p_data = json.loads(resp.read().decode('utf-8'))
        if p_data.get('code') != 0:
            raise Exception(f"Bilibili playurl API: {p_data.get('message')}")
        durl = p_data['data'].get('durl', [])
        if not durl:
            raise Exception("No direct stream URL returned by Bilibili")
        stream_url = durl[0]['url']
    return stream_url, title, owner

def trim_ingest_tasks():
    while len(INGEST_TASKS) > 100:
        keys_to_remove = [k for k, v in INGEST_TASKS.items() if v.get('status') in ('done', 'error')]
        if keys_to_remove:
            del INGEST_TASKS[keys_to_remove[0]]
        else:
            oldest_key = next(iter(INGEST_TASKS))
            del INGEST_TASKS[oldest_key]

def check_ssrf_safety(url_str):
    """Validate URL to prevent SSRF against loopback, private networks and metadata services"""
    if not url_str or not isinstance(url_str, str):
        return
    parsed = urllib.parse.urlparse(url_str)
    hostname = parsed.hostname
    if not hostname:
        return
    hostname_lower = hostname.lower().strip()

    # Explicit blacklist
    blacklist = {'169.254.169.254', 'localhost', 'metadata.google.internal'}
    if hostname_lower in blacklist or hostname_lower.endswith('.internal'):
        raise Exception(f"SSRF 攔截: 禁止訪問受限目標 ({hostname})")

    try:
        fake_ip_net = ipaddress.ip_network('198.18.0.0/15')
        addr_infos = socket.getaddrinfo(hostname_lower, None)
        for entry in addr_infos:
            ip_str = entry[4][0]
            ip = ipaddress.ip_address(ip_str)
            # Skip RFC 2544 benchmark pool (198.18.0.0/15) which is standard Fake-IP in Clash/Surge TUN proxy
            if ip in fake_ip_net:
                continue
            if ip.is_private or ip.is_loopback:
                raise Exception(f"SSRF 攔截: 解析位址 {ip_str} 屬於內部/私有網路 ({hostname})")
    except socket.gaierror:
        try:
            ip = ipaddress.ip_address(hostname_lower)
            if ip.is_private or ip.is_loopback:
                raise Exception(f"SSRF 攔截: 禁止訪問私有/內部 IP ({hostname})")
        except ValueError:
            pass

def run_ingest(t_id, v_url, v_title, v_client, page_url=''):
    print(f"[ingest] v_url={v_url[:100] if v_url else 'EMPTY'} page_url={page_url[:100] if page_url else 'EMPTY'}")
    if not v_url and page_url:
        v_url = page_url

    # SSRF verification
    for check_u in (v_url, page_url):
        if check_u:
            check_ssrf_safety(check_u)

    if t_id in INGEST_TASKS:
        INGEST_TASKS[t_id]['status'] = 'downloading'
        INGEST_TASKS[t_id]['progress'] = '正在下載影片串流...'

    out_path = ""
    try:
        clean_slug = re.sub(r'[\s\\/:*?"<>|]', '_', v_title)[:30]
        out_filename = f"ad_{int(time.time())}_{clean_slug}.mp4"
        out_path = os.path.join(VIDEOS_DIR, out_filename)

        # Check if v_url is a direct CDN video stream (e.g. Xinpianchang oss-xpc0 / mp4)
        v_url = v_url or ''
        is_xpc_cdn = bool(v_url and ('oss-xpc' in v_url or 'xpc0' in v_url or 'xpccdn.com' in v_url))

        # Check if URL is Bilibili (bypass yt-dlp 412 bot check)
        bili_match = (re.search(r'(BV[a-zA-Z0-9]+)', v_url or '')
                      or re.search(r'(BV[a-zA-Z0-9]+)', page_url or ''))
        if bili_match:
            try:
                bvid = bili_match.group(1)
                print(f"[Bilibili Native] Resolving {bvid} via official playurl API...")
                s_url, b_title, b_owner = get_bilibili_stream(bvid)
                check_ssrf_safety(s_url)
                v_url = s_url
                if not v_title or v_title == '精選影視短片':
                    v_title = b_title
                if not v_client or v_client == '品牌專題':
                    v_client = b_owner
                if t_id in INGEST_TASKS:
                    INGEST_TASKS[t_id]['title'] = v_title
                    INGEST_TASKS[t_id]['client'] = v_client
                is_direct_stream = True
            except Exception as e:
                print(f"[Bilibili Native Error] {e}")
                if t_id in INGEST_TASKS:
                    INGEST_TASKS[t_id]['bili_error'] = str(e)
                is_direct_stream = False
        elif is_xpc_cdn and page_url and 'xinpianchang.com' in page_url:
            print(f"[XPC] CDN URL IP-bound, re-extracting via yt-dlp: {page_url[:80]}")
            v_url = page_url
            is_direct_stream = False
        else:
            is_direct_stream = (
                'xpccdn.com' in v_url or 
                'vod.xinpianchang.com' in v_url or 
                'bilivideo.com' in v_url or
                v_url.split('?')[0].endswith('.mp4')
            )

        if is_direct_stream:
            referer = 'https://www.bilibili.com/' if ('bilivideo.com' in v_url or 'bilibili.com' in v_url) else 'https://www.xinpianchang.com/'
            print(f"[Direct CDN Stream] Downloading from {v_url[:80]}...")
            req = urllib.request.Request(
                v_url, 
                headers={
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': referer,
                    'Accept': '*/*',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                }
            )
            max_bytes = 500 * 1024 * 1024  # 500MB limit
            with urllib.request.urlopen(req, timeout=120) as resp:
                content_len = resp.headers.get('Content-Length')
                if content_len:
                    try:
                        if int(content_len) > max_bytes:
                            raise Exception(f"檔案過大 ({int(content_len) / (1024 * 1024):.1f}MB)，超出 500MB 上限限制")
                    except ValueError:
                        pass

                downloaded = 0
                try:
                    with open(out_path, 'wb') as out_f:
                        while True:
                            chunk = resp.read(1024 * 1024)
                            if not chunk:
                                break
                            downloaded += len(chunk)
                            if downloaded > max_bytes:
                                raise Exception(f"下載數據已超出 500MB 上限限制 (已接收 {downloaded / (1024 * 1024):.1f}MB)")
                            out_f.write(chunk)
                except Exception:
                    if os.path.exists(out_path):
                        try:
                            os.remove(out_path)
                        except Exception:
                            pass
                    raise
            print(f"[Direct CDN Stream] Download complete: {out_filename}")
        else:
            # YouTube, Bilibili, Vimeo, etc.
            import yt_dlp
            ydl_opts = {
                'format': 'best[ext=mp4][height<=1080]/18/bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best',
                'outtmpl': out_path,
                'quiet': True,
                'no_warnings': True,
                'max_filesize': 500 * 1024 * 1024,
                'extractor_args': {'youtube': {'player_client': ['android', 'ios']}}
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(v_url, download=False)
                if info:
                    duration = None
                    if 'duration' in info and info['duration'] is not None:
                        duration = info['duration']
                    elif 'entries' in info and info['entries']:
                        first_entry = info['entries'][0]
                        if isinstance(first_entry, dict):
                            duration = first_entry.get('duration')

                    if duration is not None:
                        if duration < 10 or duration > 300:
                            raise Exception(f"影片時長 {duration} 秒不在允許範圍內 (限制 10-300 秒)")
                ydl.download([v_url])

        # AI Analysis
        if t_id in INGEST_TASKS:
            INGEST_TASKS[t_id]['status'] = 'analyzing'
            INGEST_TASKS[t_id]['progress'] = 'Gemini 正在逐幀視覺分析並拆解鏡頭...'

        from auto_crawler_pipeline import process_single_video
        shots = process_single_video(out_path, title=v_title, client=v_client)

        if t_id in INGEST_TASKS:
            INGEST_TASKS[t_id]['status'] = 'done'
            INGEST_TASKS[t_id]['progress'] = f'AI 拆解完成！成功收錄 {len(shots) if shots else 0} 個鏡頭'
            INGEST_TASKS[t_id]['shots'] = len(shots) if shots else 0
        print(f"[Ingest Success] {v_title} -> {len(shots) if shots else 0} shots")

    except Exception as e:
        if out_path and os.path.exists(out_path):
            try:
                os.remove(out_path)
            except Exception:
                pass
        if t_id in INGEST_TASKS:
            INGEST_TASKS[t_id]['status'] = 'error'
            INGEST_TASKS[t_id]['progress'] = f'收錄失敗: {str(e)}'
        print(f"[API Ingest Error] {e}")

class RangeFileWrapper:
    """Wrapper that limits reads to a specific byte length for HTTP 206 Partial Content"""
    def __init__(self, file_obj, length):
        self.file = file_obj
        self.bytes_remaining = length

    def read(self, size=-1):
        if self.bytes_remaining <= 0:
            return b''
        if size < 0 or size > self.bytes_remaining:
            size = self.bytes_remaining
        data = self.file.read(size)
        self.bytes_remaining -= len(data)
        return data

    def close(self):
        self.file.close()

class CineShotHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def translate_path(self, path):
        parsed = urllib.parse.urlparse(path)
        clean_path = posixpath.normpath(urllib.parse.unquote(parsed.path))

        # Route /videos/ to VIDEOS_DIR (persistent volume)
        if clean_path.startswith('/videos'):
            rel = clean_path[len('/videos'):].lstrip('/')
            safe_path = os.path.abspath(os.path.join(VIDEOS_DIR, rel))
            if safe_path.startswith(os.path.abspath(VIDEOS_DIR)):
                return safe_path
            return ""

        # Route /posters/ to POSTERS_DIR (persistent volume)
        if clean_path.startswith('/posters'):
            rel = clean_path[len('/posters'):].lstrip('/')
            safe_path = os.path.abspath(os.path.join(POSTERS_DIR, rel))
            if safe_path.startswith(os.path.abspath(POSTERS_DIR)):
                return safe_path
            return ""

        # Route /data/clips.json to DATA_FILE (persistent volume)
        if clean_path == '/data/clips.json':
            return DATA_FILE

        return super().translate_path(path)

    def check_ingest_token(self):
        """Verify request token against INGEST_TOKEN environment variable"""
        if not INGEST_TOKEN:
            return True

        token = self.headers.get('X-CineShot-Token')
        if not token:
            parsed = urllib.parse.urlparse(self.path)
            query = urllib.parse.parse_qs(parsed.query)
            token = query.get('token', [''])[0]

        if token != INGEST_TOKEN:
            self.send_response(403)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'forbidden'}).encode('utf-8'))
            return False
        return True

    def copyfile(self, source, outputfile):
        """Gracefully handle broken pipe when browser aborts video buffering"""
        try:
            super().copyfile(source, outputfile)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def send_head(self):
        """Override to implement proper HTTP 206 Range requests for macOS Safari/Chrome"""
        path = self.translate_path(self.path)
        f = None
        if os.path.isdir(path):
            parts = urllib.parse.urlsplit(self.path)
            if not parts.path.endswith('/'):
                self.send_response(301)
                new_parts = (parts[0], parts[1], parts.path + '/', parts[3], parts[4])
                new_url = urllib.parse.urlunsplit(new_parts)
                self.send_header("Location", new_url)
                self.end_headers()
                return None
            for index in "index.html", "index.htm":
                index_path = os.path.join(path, index)
                if os.path.exists(index_path):
                    path = index_path
                    break
            else:
                self.send_error(404, "File not found")
                return None

        ctype = self.guess_type(path)
        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(404, "File not found")
            return None

        fs = os.fstat(f.fileno())
        total_len = fs[6]

        # Check media caching (mp4, webm, jpg, png, etc.)
        is_media = any(path.endswith(ext) for ext in ('.mp4', '.webm', '.jpg', '.jpeg', '.png', '.webp'))
        etag = f'"{int(fs.st_mtime)}-{total_len}"' if is_media else None

        if etag:
            if_none_match = self.headers.get('If-None-Match')
            if if_none_match and if_none_match.strip() == etag:
                self.send_response(304)
                self.send_header('ETag', etag)
                self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
                self.end_headers()
                f.close()
                return None

        # Handle HTTP Range Header (RFC 7233 compliant)
        range_header = self.headers.get('Range')
        if range_header and range_header.startswith('bytes='):
            try:
                ranges = range_header[6:].split('-')
                if not ranges[0] and len(ranges) > 1 and ranges[1]:
                    # Suffix range: bytes=-500 -> last 500 bytes
                    suffix_len = int(ranges[1])
                    start = max(0, total_len - suffix_len)
                    end = total_len - 1
                else:
                    start = int(ranges[0]) if ranges[0] else 0
                    end = int(ranges[1]) if len(ranges) > 1 and ranges[1] else total_len - 1

                if start >= total_len or end >= total_len or start > end:
                    self.send_error(416, "Requested Range Not Satisfiable")
                    f.close()
                    return None

                length = end - start + 1
                self.send_response(206)
                self.send_header('Content-Type', ctype)
                self.send_header('Content-Range', f'bytes {start}-{end}/{total_len}')
                self.send_header('Content-Length', str(length))
                self.send_header('Accept-Ranges', 'bytes')
                if is_media:
                    self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
                    self.send_header('ETag', etag)
                self.end_headers()
                f.seek(start)
                return RangeFileWrapper(f, length)
            except Exception as e:
                pass

        # Standard 200 OK
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(total_len))
        self.send_header('Accept-Ranges', 'bytes')
        if is_media:
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
            self.send_header('ETag', etag)
        self.end_headers()
        return f

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # API: Return all clips
        if path == '/api/clips' or path == '/data/clips.json':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    self.wfile.write(f.read().encode('utf-8'))
            else:
                self.wfile.write(b'[]')
            return

        # API: Health Status
        if path == '/api/status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            clips_count = 0
            if os.path.exists(DATA_FILE):
                try:
                    with open(DATA_FILE, 'r', encoding='utf-8') as f:
                        clips_count = len(json.load(f))
                except Exception:
                    pass
            from auto_crawler_pipeline import get_gemini_api_key
            res = {
                'status': 'online',
                'engine': 'CineShot Pro Engine (Multi-Threaded HTTP/206)',
                'streaming': 'Parallel Threading Enabled',
                'clipsCount': clips_count,
                'hasGeminiKey': bool(get_gemini_api_key()),
                'hasFfmpeg': bool(shutil.which('ffmpeg')),
                'activeTasks': len(INGEST_TASKS)
            }
            self.wfile.write(json.dumps(res).encode('utf-8'))
            return

        # API: Real-time Ingestion Task Status
        if path == '/api/tasks':
            if not self.check_ingest_token():
                return
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(list(INGEST_TASKS.values())[-50:]).encode('utf-8'))
            return

        # Bookmarklet: True 1-Click Ingestion
        if path == '/import':
            if not self.check_ingest_token():
                return
            query = urllib.parse.parse_qs(parsed.query)
            video_url = query.get('url', [''])[0]
            title = query.get('title', ['新片場精選'])[0]
            client = query.get('client', ['新片場精選'])[0]

            if video_url:
                import threading, re
                def run_import(v_url, v_title, v_client):
                    try:
                        import yt_dlp, time
                        clean_slug = re.sub(r'[\s\\/:*?"<>|]', '_', v_title)[:30]
                        out_filename = f"ad_{int(time.time())}_{clean_slug}.mp4"
                        out_path = os.path.join(VIDEOS_DIR, out_filename)
                        ydl_opts = {
                            'format': 'best[ext=mp4][height<=1080]/18/bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best',
                            'outtmpl': out_path,
                            'quiet': True,
                            'no_warnings': True,
                            'extractor_args': {'youtube': {'player_client': ['android', 'ios']}}
                        }
                        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                            ydl.download([v_url])
                        from auto_crawler_pipeline import process_single_video
                        process_single_video(out_path, title=v_title, client=v_client)
                    except Exception as e:
                        print(f"[Import Error] {e}")

                threading.Thread(target=run_import, args=(video_url, title, client), daemon=True).start()

            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>CineShot 收錄成功</title>
    <style>
        body {{
            background: #0f1015;
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            text-align: center;
        }}
        .card {{
            background: #171922;
            border: 1px solid #ffaa00;
            border-radius: 12px;
            padding: 30px 40px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            max-width: 480px;
        }}
        h2 {{ color: #ffaa00; margin-top: 0; font-size: 22px; }}
        p {{ color: #bbb; font-size: 14px; line-height: 1.6; }}
        .badge {{ background: #222634; padding: 6px 12px; border-radius: 6px; font-weight: bold; color: #ffaa00; display: inline-block; margin: 8px 0; }}
    </style>
</head>
<body>
    <div class="card">
        <h2>🎬 CineShot 成功收錄！</h2>
        <p>已成功捕獲影片：<br><span class="badge">{title}</span></p>
        <p>⚡ 雲端機房正以百兆光纖下載，Gemini 3.5 AI 正在為您逐幀拉片切片！<br>約 20 秒後即可在 CineShot 搜尋到。</p>
        <p style="color:#666; font-size:12px;">（本視窗將在 3 秒後自動關閉）</p>
    </div>
    <script>
        setTimeout(() => {{
            window.close();
        }}, 3500);
    </script>
</body>
</html>"""
            self.wfile.write(html.encode('utf-8'))
            return

        # Serve static files
        return super().do_GET()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization, X-CineShot-Token')
        self.end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/ingest':
            if not self.check_ingest_token():
                return
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode('utf-8'))
                candidates = [payload.get('videoUrl'), payload.get('streamUrl'), payload.get('pageUrl')]
                video_url = next((u for u in candidates if u and isinstance(u, str) and not u.strip().startswith('blob:')), '')
                page_url = payload.get('pageUrl', '')
                if page_url and page_url.strip().startswith('blob:'):
                    page_url = ''
                title = payload.get('title') or '精選影視短片'
                client = payload.get('client') or '品牌專題'

                task_id = f"task_{int(time.time())}"
                INGEST_TASKS[task_id] = {
                    'id': task_id,
                    'title': title,
                    'client': client,
                    'status': 'downloading',
                    'progress': '正在下載影片串流...',
                    'time': time.time(),
                    'shots': 0
                }
                trim_ingest_tasks()

                threading.Thread(target=run_ingest, args=(task_id, video_url, title, client, page_url), daemon=True).start()

                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'status': 'queued',
                    'taskId': task_id,
                    'message': f'正在為您將《{title}》進行 AI 深度拉片與切片'
                }, ensure_ascii=False).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
                return

        if path == '/api/batch_ingest':
            if not self.check_ingest_token():
                return
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode('utf-8'))
                raw_videos = payload.get('videos', [])
                if not isinstance(raw_videos, list):
                    raw_videos = []

                task_ids = []
                batch_jobs = []
                now = time.time()

                for idx, item in enumerate(raw_videos):
                    if not isinstance(item, dict):
                        continue
                    candidates = [item.get('videoUrl'), item.get('streamUrl'), item.get('pageUrl')]
                    video_url = next((u for u in candidates if u and isinstance(u, str) and not u.strip().startswith('blob:')), '')
                    page_url = item.get('pageUrl', '')
                    if page_url and page_url.strip().startswith('blob:'):
                        page_url = ''
                    title = item.get('title') or f'批量影片 #{idx + 1}'
                    client = item.get('client') or '品牌專題'

                    task_id = f"task_{int(now)}_{idx + 1}"
                    INGEST_TASKS[task_id] = {
                        'id': task_id,
                        'title': title,
                        'client': client,
                        'status': 'queued',
                        'progress': '排隊中...',
                        'time': now + (idx * 0.001),
                        'shots': 0
                    }
                    task_ids.append(task_id)
                    batch_jobs.append((task_id, video_url, title, client, page_url))
                    trim_ingest_tasks()

                def process_batch(jobs):
                    print(f"[Batch Ingest] Worker started: processing {len(jobs)} videos sequentially")
                    for t_id, v_url, t_title, t_client, p_url in jobs:
                        try:
                            run_ingest(t_id, v_url, t_title, t_client, p_url)
                        except Exception as e:
                            print(f"[Batch Ingest Error] Task {t_id} failed: {e}")
                    print(f"[Batch Ingest] Completed all {len(jobs)} videos.")

                if batch_jobs:
                    threading.Thread(target=process_batch, args=(batch_jobs,), daemon=True).start()

                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'queued': len(task_ids),
                    'taskIds': task_ids
                }, ensure_ascii=False).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
                return

        if path == '/api/admin/clips':
            return self.handle_delete_clips()

        if path == '/api/admin/migrate_r2':
            if not self.check_ingest_token():
                return
            from migrate_to_r2 import run_migration
            def bg_migrate():
                try:
                    run_migration()
                except Exception as me:
                    print(f"[R2 Migration Error] {me}")

            threading.Thread(target=bg_migrate, daemon=True).start()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'message': 'Cloudflare R2 遷移已在後台啟動，正在備份 clips.json 並將影片與封面同步至 R2'
            }, ensure_ascii=False).encode('utf-8'))
            return

        self.send_response(404)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({'error': 'Not found'}).encode('utf-8'))

    def handle_delete_clips(self):
        """Delete specific clips and their posters without deleting original video files"""
        if not self.check_ingest_token():
            return
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length > 0 else b'{}'
        try:
            payload = json.loads(body.decode('utf-8'))
            target_ids = set(payload.get('ids', []))
            if not target_ids:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'ids array required'}).encode('utf-8'))
                return

            deleted_ids = []
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    clips = json.load(f)

                new_clips = []
                for c in clips:
                    if not isinstance(c, dict):
                        continue
                    cid = c.get('id')
                    if cid in target_ids:
                        deleted_ids.append(cid)
                        # Remove poster if exists
                        poster_path = os.path.join(POSTERS_DIR, f"{cid}.jpg")
                        if os.path.exists(poster_path):
                            try:
                                os.remove(poster_path)
                            except Exception as pe:
                                print(f"[Delete Poster Warning] {pe}")
                        # Remove poster from R2 if present
                        try:
                            from r2_storage import delete_file_from_r2
                            delete_file_from_r2(f"posters/{cid}.jpg")
                        except Exception:
                            pass
                    else:
                        new_clips.append(c)

                with open(DATA_FILE, 'w', encoding='utf-8') as f:
                    json.dump(new_clips, f, ensure_ascii=False, indent=2)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'deletedCount': len(deleted_ids),
                'deletedIds': deleted_ids
            }, ensure_ascii=False).encode('utf-8'))
            return
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            return

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/admin/clips':
            return self.handle_delete_clips()

        self.send_response(404)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps({'error': 'Not found'}).encode('utf-8'))

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization, X-CineShot-Token')
        super().end_headers()

def run_server():
    init_storage()
    server_address = ('', PORT)
    httpd = ThreadingHTTPServer(server_address, CineShotHandler)
    print("=" * 60)
    print(f"🎬 CineShot (影鏡) - 乾淨極簡搜尋首頁與視聽語言檢索台已就緒！(多線程模式)")
    print(f"👉 請在瀏覽器打開：http://localhost:{PORT}")
    print(f"📁 存儲配置: VIDEOS_DIR={VIDEOS_DIR} | DATA_FILE={DATA_FILE}")
    if not INGEST_TOKEN:
        print("⚠️  警告：未配置 INGEST_TOKEN 環境變數，/api/ingest 與 /import 處於免鑑權模式！生產環境請務必設定 INGEST_TOKEN。")
    print("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.server_close()

if __name__ == '__main__':
    run_server()
