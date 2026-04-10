from fastapi import APIRouter, BackgroundTasks
from models.schema import UploadNotification
from services.pdf_service import process_pdf_pipeline

router = APIRouter()

@router.post("/pdf-uploaded")
async def pdf_uploaded(payload: UploadNotification, background_tasks: BackgroundTasks):
    background_tasks.add_task(process_pdf_pipeline, payload.fileKey)
    return {"status": "processing_queued"}
