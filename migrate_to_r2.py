"""
One-off Migration Script: Sync Local Videos & Posters to Cloudflare R2
Uploads /data/videos/* and /data/posters/* to R2 and updates clips.json URLs.
"""

import os
import sys
import json
import time
import shutil
from r2_storage import is_r2_configured, get_r2_config, upload_file_to_r2

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')

# Determine persistent directory
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

def run_migration(overwrite=False, logger_func=print):
    """
    Executes full migration of videos, posters, and clips.json to Cloudflare R2.
    """
    cfg = get_r2_config()
    if not is_r2_configured():
        msg = "Cloudflare R2 is not configured. Please set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY."
        logger_func(f"[Migration Error] {msg}")
        return {"success": False, "error": msg}

    public_domain = cfg['public_domain']
    logger_func(f"🚀 Starting R2 Migration -> Bucket: {cfg['bucket_name']} | Public Domain: {public_domain}")
    logger_func(f"📁 Target Directories: VIDEOS_DIR={VIDEOS_DIR} | POSTERS_DIR={POSTERS_DIR} | DATA_FILE={DATA_FILE}")

    # 1. Backup clips.json before doing any modifications
    backup_file = None
    if os.path.exists(DATA_FILE):
        backup_file = f"{DATA_FILE}.bak.{int(time.time())}"
        try:
            shutil.copyfile(DATA_FILE, backup_file)
            logger_func(f"📦 [Backup] Created backup of clips.json at: {backup_file}")
        except Exception as e:
            logger_func(f"⚠️ [Backup Warning] Failed to backup clips.json: {e}")

    # 2. Upload Videos
    videos_uploaded = 0
    videos_failed = 0
    if os.path.exists(VIDEOS_DIR):
        video_files = [f for f in os.listdir(VIDEOS_DIR) if not f.startswith('.') and f.lower().endswith(('.mp4', '.mov', '.webm'))]
        logger_func(f"📹 Found {len(video_files)} video files in {VIDEOS_DIR} to sync...")
        for idx, fname in enumerate(video_files, 1):
            fpath = os.path.join(VIDEOS_DIR, fname)
            logger_func(f"  [{idx}/{len(video_files)}] Uploading video: {fname} ({os.path.getsize(fpath) / (1024*1024):.1f} MB)...")
            res_url = upload_file_to_r2(fpath, f"videos/{fname}", content_type="video/mp4", overwrite=overwrite)
            if res_url:
                videos_uploaded += 1
            else:
                videos_failed += 1
                logger_func(f"    ❌ Failed to upload video: {fname}")
    else:
        logger_func(f"ℹ️ Videos directory {VIDEOS_DIR} does not exist. Skipping videos upload.")

    # 3. Upload Posters
    posters_uploaded = 0
    posters_failed = 0
    if os.path.exists(POSTERS_DIR):
        poster_files = [f for f in os.listdir(POSTERS_DIR) if not f.startswith('.') and f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))]
        logger_func(f"🖼️ Found {len(poster_files)} poster files in {POSTERS_DIR} to sync...")
        for idx, fname in enumerate(poster_files, 1):
            fpath = os.path.join(POSTERS_DIR, fname)
            res_url = upload_file_to_r2(
                fpath,
                f"posters/{fname}",
                content_type="image/jpeg",
                cache_control="public, max-age=31536000, immutable",
                overwrite=overwrite
            )
            if res_url:
                posters_uploaded += 1
            else:
                posters_failed += 1
                logger_func(f"    ❌ Failed to upload poster: {fname}")
    else:
        logger_func(f"ℹ️ Posters directory {POSTERS_DIR} does not exist. Skipping posters upload.")

    # 4. Update clips.json
    clips_updated = 0
    total_clips = 0
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                clips = json.load(f)
            total_clips = len(clips)

            for clip in clips:
                if not isinstance(clip, dict):
                    continue
                changed = False

                # Convert local /videos/ URL to R2 public URL
                preview_url = clip.get('previewUrl', '')
                if preview_url.startswith('/videos/'):
                    v_name = preview_url[len('/videos/'):].lstrip('/')
                    clip['previewUrl'] = f"{public_domain}/videos/{v_name}"
                    changed = True

                # Convert local /posters/ URL to R2 public URL
                poster_url = clip.get('posterUrl', '')
                if poster_url and poster_url.startswith('/posters/'):
                    p_name = poster_url[len('/posters/'):].lstrip('/')
                    clip['posterUrl'] = f"{public_domain}/posters/{p_name}"
                    changed = True

                if changed:
                    clips_updated += 1

            with open(DATA_FILE, 'w', encoding='utf-8') as f:
                json.dump(clips, f, ensure_ascii=False, indent=2)

            logger_func(f"✅ [clips.json] Updated {clips_updated} of {total_clips} clip records with R2 URLs.")
        except Exception as e:
            logger_func(f"❌ [clips.json Update Error] {e}")

    result = {
        "success": True,
        "backupFile": backup_file,
        "videosUploaded": videos_uploaded,
        "videosFailed": videos_failed,
        "postersUploaded": posters_uploaded,
        "postersFailed": posters_failed,
        "clipsUpdated": clips_updated,
        "totalClips": total_clips,
        "publicDomain": public_domain
    }
    logger_func(f"🎉 Migration completed successfully! Summary: {result}")
    return result

if __name__ == '__main__':
    print("=" * 60)
    print("🎬 CineShot - Cloudflare R2 Storage Migration Tool")
    print("=" * 60)
    run_migration()
