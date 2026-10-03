"""
Cloudflare R2 Storage Adapter for CineShot
Handles video and poster image uploads to Cloudflare R2 (S3-compatible API).
"""

import os
import mimetypes

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_r2_config():
    """Retrieve R2 configuration from environment variables or .env file"""
    acc_id = os.environ.get('R2_ACCOUNT_ID', '0d5f74ee81504de866f341ac9e08cfa6')
    access_key = os.environ.get('R2_ACCESS_KEY_ID')
    secret_key = os.environ.get('R2_SECRET_ACCESS_KEY')
    bucket_name = os.environ.get('R2_BUCKET_NAME', 'cineshot-videos')
    public_domain = os.environ.get('R2_PUBLIC_DOMAIN', 'https://pub-97bfd99f271d499a81b640d533c8f208.r2.dev')

    if not access_key or not secret_key:
        env_file = os.path.join(BASE_DIR, '.env')
        if os.path.exists(env_file):
            with open(env_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('R2_ACCOUNT_ID='):
                        acc_id = line.split('=', 1)[1].strip().strip('"').strip("'")
                    elif line.startswith('R2_ACCESS_KEY_ID='):
                        access_key = line.split('=', 1)[1].strip().strip('"').strip("'")
                    elif line.startswith('R2_SECRET_ACCESS_KEY='):
                        secret_key = line.split('=', 1)[1].strip().strip('"').strip("'")
                    elif line.startswith('R2_BUCKET_NAME='):
                        bucket_name = line.split('=', 1)[1].strip().strip('"').strip("'")
                    elif line.startswith('R2_PUBLIC_DOMAIN='):
                        public_domain = line.split('=', 1)[1].strip().strip('"').strip("'")

    if public_domain:
        public_domain = public_domain.rstrip('/')

    return {
        'account_id': acc_id,
        'access_key': access_key,
        'secret_key': secret_key,
        'bucket_name': bucket_name,
        'public_domain': public_domain
    }

def get_r2_storage():
    """
    Returns (s3_client, bucket_name, public_domain) if configured, else (None, None, None)
    """
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        return None, None, None

    cfg = get_r2_config()
    if not cfg['access_key'] or not cfg['secret_key'] or not cfg['bucket_name']:
        return None, None, None

    endpoint_url = f"https://{cfg['account_id']}.r2.cloudflarestorage.com"
    try:
        s3 = boto3.client(
            's3',
            endpoint_url=endpoint_url,
            aws_access_key_id=cfg['access_key'],
            aws_secret_access_key=cfg['secret_key'],
            config=Config(signature_version='s3v4')
        )
        return s3, cfg['bucket_name'], cfg['public_domain']
    except Exception as e:
        print(f"[R2 Init Warning] Could not initialize R2 client: {e}")
        return None, None, None

def is_r2_configured():
    """Check if R2 credentials are present"""
    s3, bucket, _ = get_r2_storage()
    return bool(s3 and bucket)

def upload_file_to_r2(local_path, s3_key, content_type=None, cache_control=None, overwrite=False):
    """
    Upload a local file to Cloudflare R2.
    Returns the public HTTP URL on success, or None on failure.
    """
    if not os.path.exists(local_path):
        return None

    s3, bucket, public_domain = get_r2_storage()
    if not s3 or not bucket:
        return None

    s3_key = s3_key.lstrip('/')

    # Check if file already exists in bucket when overwrite is False
    if not overwrite:
        try:
            head = s3.head_object(Bucket=bucket, Key=s3_key)
            local_size = os.path.getsize(local_path)
            # If size matches, skip re-uploading
            if head.get('ContentLength') == local_size:
                return f"{public_domain}/{s3_key}"
        except Exception:
            pass

    extra_args = {}
    if content_type:
        extra_args['ContentType'] = content_type
    else:
        guessed = mimetypes.guess_type(local_path)[0]
        if guessed:
            extra_args['ContentType'] = guessed

    if cache_control:
        extra_args['CacheControl'] = cache_control

    try:
        s3.upload_file(
            local_path,
            bucket,
            s3_key,
            ExtraArgs=extra_args if extra_args else None
        )
        return f"{public_domain}/{s3_key}"
    except Exception as e:
        print(f"[R2 Upload Error] Failed to upload {local_path} to {s3_key}: {e}")
        return None

def delete_file_from_r2(s3_key):
    """Delete an object from Cloudflare R2"""
    s3, bucket, _ = get_r2_storage()
    if not s3 or not bucket:
        return False
    try:
        s3_key = s3_key.lstrip('/')
        s3.delete_object(Bucket=bucket, Key=s3_key)
        return True
    except Exception as e:
        print(f"[R2 Delete Warning] Failed to delete {s3_key}: {e}")
        return False
