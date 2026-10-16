"""The /register and /login counters. Mints JWTs; nothing else in the app does."""

import os 
import jwt          # PyJWT. The import name is 'jwt', NOT 'pyjwt'
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from backend.database import create_user, get_user_by_email, verify_password

load_dotenv()

router = APIRouter()

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET missing - add it to .env (python -c \"import secrets; print(secrets.token_hex(32))\")")

JWT_ALGORITHM = "HS256"
TOKEN_TTL_HOURS = 24         # a stolen token is valid until this runs out - there is no logout on the server

class AuthRequest(BaseModel):
    """Both /register and /login take the same two fields, so one model serves both."""
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=72)       # 72 = bcrypt's hard ceiling, see below

class TokenResponse(BaseModel):
    """What both endpoints hand back. The id is here so the frontend can show who  is  logged in."""
    token: str
    user_id: int
    email: str

def create_token(user_id, email):
    """Stamp the ticket. Returns a signed JWT string - readable by anyone, forgeable by nobody."""
    payload = {
        "sub": str(user_id),      # 'subject' = who this token is about. Spec says string, PyJWT enforces it
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token):
    """Check the stamp. Returns the user_id, or raises 401. The only gate S3 will use."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM]) 
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired. Please log in again.")
    except jwt.InvalidTokenError:      # bad signature, tampered payload, garbage string
        raise HTTPException(401, "Invalid token.")
    return int(payload["sub"])

@router.post("/register", response_model=TokenResponse)
def register_route(body: AuthRequest):
    """Make an account and log them straight in - no 'now please log in' round trip."""
    email = body.email.strip().lower()
    user_id = create_user(email, body.password)
    if user_id is None:
        raise HTTPException(409, "That email is already registered.")
    return {"token": create_token(user_id, email), "user_id": user_id, "email":email}

@router.post("/login", response_model=TokenResponse)
def login_route(body: AuthRequest):
    """Check the password, hand back a token. One error message for every kind of failure."""
    email = body.email.strip().lower()
    user = get_user_by_email(email)

    # ponytail: deliberately identical message for both branches - no email-existence oracle.
    # Timing still differs (bcrypt only runs when the row exists); dummy-hash fix if it ever matters.
    if user is None or not verify_password(body.password, user[1]):
        raise HTTPException(401, "Invalid email or password.")
    
    return {"token": create_token(user[0], email), "user_id": user[0], "email": email} 

if __name__ == "__main__":
    from pydantic import ValidationError

    def raises_401(token, snippet):
        """Assert decode_token rejects this token with a message containing snippet."""
        try: 
            decode_token(token)
        except HTTPException as e:
            assert snippet in e.detail, f"wrong message: {e.detail}"
            return 
        assert False, f"expected a 401 mentioning {snippet!r}, but the token was accepted"

    def rejects(email="a@b.com", password="longenough"):
        """Assert AuthRequest refuses this pair at the trust boundary."""
        try:
            AuthRequest(email=email, password=password)
        except ValidationError:
            return 
        assert False, f"AuthRequest accepted {email!r} / {len(password)}-char password"

    # 1. round trip - the only happy path
    assert decode_token(create_token(7, "a@b.com")) == 7

    # 2. forged: valid base64, valid structure, signed with the WRONG secret. The real signature test.
    forged = jwt.encode({"sub": "1", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
                        "not-the-real-secret", algorithm=JWT_ALGORITHM)
    raises_401(forged, "Invalid")

    # 3. expired: OUR secret, genuine signature, exp in the past. Must say 'expired', not 'invalid'
    stale = jwt.encode({"sub": "7", "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
                       JWT_SECRET, algorithm=JWT_ALGORITHM)
    raises_401(stale, "expired")

    # 4. the payload is PUBLIC - no secret needed to read it. This is why no password ever goes in a token
    peek = jwt.decode(create_token(7, "a@b.com"), options={"verify_signature": False})
    assert peek["email"] == "a@b.com", peek

    # 5. the trust boundary
    rejects(email="prince.gmail.com")
    rejects(password="short")
    rejects(password="x" * 73)

    print("auth self-check: 7 checks passed")
    