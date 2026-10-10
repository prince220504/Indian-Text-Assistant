import os
import psycopg2
import bcrypt
from dotenv import load_dotenv
from psycopg2.extras import Json

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL missing - add it to .env (neon.tech connection string)")

def get_conn():
    """Open a fresh connection. Caller closes it (we use 'with', which does it for us)."""
    return psycopg2.connect(DATABASE_URL)

def hash_password(password):
    """Plaintext in, bcrypt hash out. gensalt() makes a fresh random salt; it ends up inside the result."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password, password_hash):
    """True if the plaintext matches the stored hash - bcrypt reads the salt and cost back out of the hash."""
    return bcrypt.checkpw(password.encode(), password_hash.encode())

def create_user(email, password):
    """Register one user. Return the new id, or None if that email is already taken."""
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (email, password_hash) VALUES (%s, %s) RETURNING id",
                (email.strip().lower(), hash_password(password)),
            )
            return cur.fetchone()[0]
    except psycopg2.errors.UniqueViolation:
        return None

def get_user_by_email(email):
    """Return (id, password_hash) for a login attempt, or None if there's no such user."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, password_hash FROM users WHERE email = %s", (email.strip().lower(),))
        return cur.fetchone()

def init_db():
    """Create the users and messages table if it isn't there yet. Safe to run every startup."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
            id              SERIAL         PRIMARY KEY,
            email           TEXT           UNIQUE NOT NULL,  
            password_hash   TEXT           NOT NULL,
            created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS messages (
            id           SERIAL PRIMARY KEY,
            session_id   TEXT         NOT NULL,
            role         TEXT         NOT NULL,
            content      TEXT         NOT NULL,
            created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
            )
        """)

        # migration: the table predates sources (Day 13). Nullable, so the rows
        # already in there stay valid - they just have no pills.
        cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS sources JSONB")

def save_message(session_id, role, content, sources=None):
    """Append one message to a session's history."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO messages (session_id, role, content, sources) VALUES (%s, %s, %s, %s)",
            (session_id, role, content, Json(sources) if sources else None),
        )

def get_history(session_id, limit=10):
    """Return the last 'limit' messages for a session, oldest first, as (role, content, sources)."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT role, content, sources FROM messages
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

    sid = f"selftest-{uuid.uuid4()}"

    save_message(sid, "user", "What is the GST registration threshold?")
    save_message(sid, "assistant", "Rs 40 lakh for goods.", [{"source": "gst.pdf", "page": 1}])

    rows = get_history(sid)
    assert rows[0][2] is None, "user must have no sources"
    assert rows[1][2] == [{"source": "gst.pdf", "page": 1}], "sources did not survive the JSONB round-trip"
    print(rows)

    assert len(rows) == 2, f"expected 2 rows, got {len(rows)}" 
    assert rows[0][0] == "user", "history came back in the wrong order"

    assert get_history(f"other-{uuid.uuid4()}") == [], "session filter leaked rows"

    print("OK - write, read, order, isolation")

    # --- users (Day 28) ---
    email = f"selftest-{uuid.uuid4()}@example.com"

    uid = create_user(email, "correct-horse")
    assert uid is not None, "first registration should succeed"

    assert create_user(email, "whatever") is None, "UNIQUE did not stop the duplicate email"
    assert create_user(f" {email.upper()} ", "whatever") is None, "normalisation leak - case/space made a second account"

    row = get_user_by_email(email)
    assert row is not None and row[0] == uid, "lookup did not find the user we just made"

    stored = row[1]
    assert stored != "correct-horse", "password stored in PLAINTEXT"
    assert stored.startswith("$2b$"), f"not a bcrypt hash: {stored[:10]}"
    assert verify_password("correct-horse", stored), "right password rejected"
    assert not verify_password("wrong-horse", stored), "wrong password accepted"

    assert hash_password("x") != hash_password("x"), "same hash twice - the salt is not random"

    assert get_user_by_email(f"nobody-{uuid.uuid4()}@example.com") is None, "lookup invented a user"

    print("OK - users: hashing, salt, verify, UNIQUE, normalisation")
