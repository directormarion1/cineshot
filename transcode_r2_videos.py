"""
Batch Transcoding Script for Cloudflare R2 Videos
Scans R2 bucket cineshot-videos for non-H.264 videos (AV1, HEVC, VP9),
transcodes them to Safari/iOS-compatible H.264 (yuv420p + AAC + faststart),
and overwrites the same R2 key.
"""

import os
import sys
import subprocess
import shutil
import time
from r2_storage import get_r2_storage, get_r2_config

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TMP_DIR = os.path.join(BASE_DIR, 'tmp_r2_transcode')
os.makedirs(TMP_DIR, exist_ok=True)

def get_video_codec(url_or_path):
    """Detect video codec using ffprobe"""
    ffprobe_bin = shutil.which('ffprobe') or 'ffprobe'
    try:
        cmd = [
            ffprobe_bin, '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=codec_name',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            url_or_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=20)
        return res.stdout.strip().lower()
    except Exception as e:
        print(f"Error probing {url_or_path}: {e}")
        return None

def transcode_to_h264(input_path, output_path):
    """Transcode video to H.264 (yuv420p) + AAC with faststart for Safari/iOS compatibility"""
    ffmpeg_bin = shutil.which('ffmpeg') or 'ffmpeg'
    cmd = [
        ffmpeg_bin, '-y',
        '-i', input_path,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        output_path
    ]
    res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=600)
    return res.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 0

def run_transcode_pipeline():
    s3, bucket, public_domain = get_r2_storage()
    if not s3 or not bucket:
        print("❌ Cloudflare R2 is not configured. Please check environment variables or .env.")
        return

    print("=" * 70)
    print(f"🎬 CineShot - R2 Video Transcoder (Target: H.264 / AAC / Safari Full Compatibility)")
    print(f"📦 Target Bucket: {bucket} | Endpoint: {public_domain}")
    print("=" * 70)

    resp = s3.list_objects_v2(Bucket=bucket, Prefix='videos/')
    items = [obj for obj in resp.get('Contents', []) if obj['Key'].lower().endswith(('.mp4', '.mov', '.webm'))]
    print(f"Found {len(items)} videos in {bucket}/videos/\n")

    stats = {
        'total': len(items),
        'skipped_h264': 0,
        'transcoded_success': 0,
        'transcoded_failed': 0
    }

    for idx, item in enumerate(items, 1):
        key = item['Key']
        size_mb = item['Size'] / (1024 * 1024)
        filename = os.path.basename(key)
        remote_url = f"{public_domain}/{key}"

        print(f"[{idx}/{len(items)}] Probing: {filename} ({size_mb:.2f} MB)...", end=" ", flush=True)

        codec = get_video_codec(remote_url)
        print(f"Codec: [{codec}]")

        if codec == 'h264':
            print(f"  ⏭️  Already H.264 (avc1), skipping.")
            stats['skipped_h264'] += 1
            continue

        print(f"  ⚡ Found non-H.264 stream ({codec}). Initiating transcode...")

        # 1. Download original
        local_orig = os.path.join(TMP_DIR, filename)
        local_transcoded = os.path.join(TMP_DIR, f"transcoded_{filename}")

        print(f"  📥 Downloading from R2...", end=" ", flush=True)
        try:
            s3.download_file(bucket, key, local_orig)
            print(f"Done ({os.path.getsize(local_orig) / (1024 * 1024):.2f} MB).")
        except Exception as e:
            print(f"❌ Download failed: {e}")
            stats['transcoded_failed'] += 1
            continue

        # 2. Transcode with ffmpeg
        print(f"  🔄 Transcoding to H.264 (libx264, yuv420p, faststart)...", end=" ", flush=True)
        t_start = time.time()
        success = transcode_to_h264(local_orig, local_transcoded)
        t_elapsed = time.time() - t_start

        if not success:
            print(f"❌ Transcoding failed.")
            stats['transcoded_failed'] += 1
            if os.path.exists(local_orig):
                try: os.remove(local_orig)
                except Exception: pass
            continue

        trans_size_mb = os.path.getsize(local_transcoded) / (1024 * 1024)
        print(f"Done in {t_elapsed:.1f}s ({trans_size_mb:.2f} MB).")

        # 3. Verify transcoded codec
        new_codec = get_video_codec(local_transcoded)
        if new_codec != 'h264':
            print(f"❌ Verification failed: new codec is {new_codec}")
            stats['transcoded_failed'] += 1
            continue

        # 4. Overwrite same key in R2
        print(f"  📤 Overwriting R2 key: {key}...", end=" ", flush=True)
        try:
            s3.upload_file(
                local_transcoded,
                bucket,
                key,
                ExtraArgs={'ContentType': 'video/mp4'}
            )
            print("✅ Overwrite Complete!")
            stats['transcoded_success'] += 1
        except Exception as e:
            print(f"❌ Upload failed: {e}")
            stats['transcoded_failed'] += 1

        # 5. Clean up temporary files
        for f in (local_orig, local_transcoded):
            if os.path.exists(f):
                try: os.remove(f)
                except Exception: pass

        print("-" * 50)

    print("\n" + "=" * 70)
    print("🎉 Transcoding Batch Summary:")
    print(f"  Total Videos:       {stats['total']}")
    print(f"  Already H.264:      {stats['skipped_h264']}")
    print(f"  Successfully Fixed: {stats['transcoded_success']}")
    print(f"  Failed:             {stats['transcoded_failed']}")
    print("=" * 70)

if __name__ == '__main__':
    run_transcode_pipeline()
