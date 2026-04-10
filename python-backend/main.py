from fastapi import FastAPI
from api.routes import router
from contextlib import asynccontextmanager
from services.db_service import init_db, get_db

app = FastAPI()

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting up...")
    init_db()
    print("Shutting down...")

@app.on_event("startup")
def startup():
    init_db() 

@app.get("/rules")
def get_all_rules():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        SELECT value
        FROM compliance_rules
        CROSS JOIN LATERAL jsonb_array_elements(rules->'rules') AS value;
    """)

    rows = cur.fetchall()

    cur.close()
    conn.close()

    return {
        "rules": [r[0] for r in rows]
    }

