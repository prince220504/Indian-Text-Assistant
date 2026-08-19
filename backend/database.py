import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL missing - add it to .env (neon.tech connection string)")

def get_conn():
    """Open a fresh connection. Caller closes it (we use 'with', which does it for us)."""
    return psycopg2.connect(DATABASE_URL)

def init_db():
    """Create the messages table if it isn't there yet. Safe to run every startup."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS messages (
            id           SERIAL PRIMARY KEY,
            session_id   TEXT         NOT NULL,
            role         TEXT         NOT NULL,
            content      TEXT         NOT NULL,
            created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
            )
        """)

def save_message(session_id, role, content):
    """Append one message to a session's history."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO messages (session_id, role, content) VALUES (%s, %s, %s)",
            (session_id, role, content),
        )

def get_history(session_id, limit=10):
    """Return the last 'limit' messages for a session, oldest first, as (role, content)."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT role, content FROM messages
               WHERE session_id = %s
               ORDER BY created_at DESC
               LIMIT %s""",
            (session_id, limit),
        )
        return cur.fetchall()[::-1]      # newest-first from SQL, flipped back to reading order

if __name__ == "__main__":
    import uuid

    init_db()
    print("table ready")

    sid = f"selftest-{uuid.uuid4}"

    save_message(sid, "user", "What is the GST registration threshold?")
    save_message(sid, "assistant", "Rs 40 lakh for goods.")

    rows = get_history(sid)
    print(rows)

    assert len(rows) == 2, f"expected 2 rows, got {len(rows)}" 
    assert rows[0][0] == "user", "history came back in the wrong order"

    assert get_history(f"other-{uuid.uuid4()}") == [], "session filter leaked rows"

    print("OK - write, read, order, isolation")
