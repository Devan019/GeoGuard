from fastapi import FastAPI
from api.routes import router
from contextlib import asynccontextmanager
from services.db_service import init_db

app = FastAPI()

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting up...")
    init_db()
    print("Shutting down...")

@app.on_event("startup")
def startup():
    init_db() 

app.include_router(router)