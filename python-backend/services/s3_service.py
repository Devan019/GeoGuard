import os
import uuid
import boto3
import tempfile
from PIL import Image
from dotenv import load_dotenv
import io
load_dotenv()

AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION")

s3 = boto3.client(
    "s3",
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY,
    region_name=AWS_REGION,
)

BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME")

def download_pdf(file_key: str) -> str:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    s3.download_fileobj(BUCKET_NAME, file_key, tmp)
    return tmp.name

def upload_pil_to_s3(img: Image.Image, prefix: str) -> str:
    """
    Saves a PIL Image to an in-memory buffer and uploads it directly to AWS S3.
    Returns the generated S3 object key.
    """
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    buffered.seek(0) # Reset buffer position to the beginning before upload

    # Generate a unique file name to prevent overwriting
    file_key = f"ai-detections/{prefix}_{uuid.uuid4().hex}.png"

    # Upload directly from memory
    s3.upload_fileobj(
        buffered, 
        BUCKET_NAME, 
        file_key,
        ExtraArgs={'ContentType': 'image/png'} 
    )
    
    return file_key