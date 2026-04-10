import os
import psycopg2
from dotenv import load_dotenv
import json
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def get_db():
    return psycopg2.connect(DATABASE_URL)


def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS compliance_rules (
            id SERIAL PRIMARY KEY,
            source_file TEXT,
            rules JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS processed_files (
            id SERIAL PRIMARY KEY,
            file_key TEXT UNIQUE,
            processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    conn.commit()
    cur.close()
    conn.close()


def is_file_processed(file_key: str) -> bool:
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT 1 FROM processed_files WHERE file_key=%s", (file_key,))
    exists = cur.fetchone() is not None

    cur.close()
    conn.close()

    return exists


def mark_file_processed(file_key: str):
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        "INSERT INTO processed_files (file_key) VALUES (%s) ON CONFLICT DO NOTHING",
        (file_key,)
    )

    conn.commit()
    cur.close()
    conn.close()


def insert_rules(file_key: str, rules: list):
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO compliance_rules (source_file, rules)
        VALUES (%s, %s)
        RETURNING id;
        """,
        (file_key, json.dumps({"rules": rules}))
    )

    inserted_id = cur.fetchone()[0]

    conn.commit()
    cur.close()
    conn.close()

    return inserted_id