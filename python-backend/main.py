from fastapi import FastAPI
from api.routes import router
from contextlib import asynccontextmanager
from services.db_service import init_db, get_db

app = FastAPI()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    print("🚀 Starting up GeoGuard Backend...")
    init_db()
    yield
    # Shutdown logic
    print("🛑 Shutting down GeoGuard Backend...")

app = FastAPI(
    title="Unified Satellite Change Detection API",
    lifespan=lifespan
)

@app.get("/rules")
def get_all_rules():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT rules FROM compliance_rules WHERE rules IS NOT NULL;")

    rows = cur.fetchall()

    cur.close()
    conn.close()

    return {
        "rules": [r[0] for r in rows]
    }

app.include_router(router)