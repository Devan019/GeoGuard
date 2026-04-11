from fastapi import APIRouter, BackgroundTasks, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import List
from models.schema import UploadNotification
from services.pdf_service import process_pdf_pipeline
from services.raster_to_vector import vectorize
import asyncio
from services.connection_manager import ConnectionManager

router = APIRouter()

class MapTransform(BaseModel):
    west: float
    north: float
    xsize: float
    ysize: float

class ConversionRequest(BaseModel):
    # Expecting a 2D array of integers (0s and 1s)
    raster_mask: List[List[int]]
    transform: MapTransform
    client_id: str


manager = ConnectionManager()

@router.websocket("/ws/ai-detections/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    # 4. FIX: Pass the client_id into the connect method
    await manager.connect(websocket, client_id)
    try:
        while True:
            # Keep the connection alive and listen for messages from Next.js (if any)
            data = await websocket.receive_text()
            print(f"Message from Next.js: {data}")
            
    except WebSocketDisconnect:
        # 5. FIX: Pass the client_id into the disconnect method
        manager.disconnect(client_id)
        print(f"Client {client_id} disconnected")



@router.post("/api/raster-to-vector")
async def convert_raster_to_vector(request: ConversionRequest):
    try:
        # Convert the incoming JSON list into a high-speed Numpy array
       return await vectorize(request, manager)

    except Exception as e:
        # If anything goes wrong, tell Next.js exactly what failed
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/pdf-uploaded")
async def pdf_uploaded(payload: UploadNotification, background_tasks: BackgroundTasks):
    background_tasks.add_task(process_pdf_pipeline, payload.fileKey)
    return {"status": "processing_queued"}
