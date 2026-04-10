from pydantic import BaseModel

class UploadNotification(BaseModel):
    fileKey: str