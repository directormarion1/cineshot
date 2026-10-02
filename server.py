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
from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.parse

PORT = int(os.environ.get('PORT', 8765))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')
DATA_FILE = os.path.join(PUBLIC_DIR, 'data', 'clips.json')

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
                return super().send_head()

        ctype = self.guess_type(path)
        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(404, "File not found")
            return None

        fs = os.fstat(f.fileno())
        total_len = fs[6]

        # Handle HTTP Range Header (Crucial for video streaming on macOS)
        range_header = self.headers.get('Range')
        if range_header and range_header.startswith('bytes='):
            try:
                ranges = range_header[6:].split('-')
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
                self.send_header('Cache-Control', 'no-cache')
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
        self.end_headers()
        return f

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # API: Return all clips
        if path == '/api/clips':
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
            res = {
                'status': 'online',
                'engine': 'CineShot Pro Engine',
                'streaming': 'HTTP/206 Range Enabled'
            }
            self.wfile.write(json.dumps(res).encode('utf-8'))
            return

        # Serve static files
        return super().do_GET()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Range')
        super().end_headers()

def run_server():
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, CineShotHandler)
    print("=" * 60)
    print(f"🎬 CineShot (影鏡) - 乾淨極簡搜尋首頁與視聽語言檢索台已就緒！")
    print(f"👉 請在瀏覽器打開：http://localhost:{PORT}")
    print("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.server_close()

if __name__ == '__main__':
    run_server()
