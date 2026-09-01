from fastapi import APIRouter, HTTPException
import uuid
from datetime import datetime, timedelta
from database import get_db_connection
import pymysql

router = APIRouter(prefix="/api/auth", tags=["Auth"])

@router.get("/generate-session")
def generate_session():
    token = str(uuid.uuid4())
    conn = get_db_connection()
    try:
        cursor = conn.cursor(pymysql.cursors.DictCursor)
        cursor.execute("INSERT INTO auth_sessions (session_token) VALUES (%s)", (token,))
        conn.commit()
        return {"session_token": token}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/poll-session/{token}")
def poll_session(token: str):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(pymysql.cursors.DictCursor)
        cursor.execute("SELECT status, target_view FROM auth_sessions WHERE session_token = %s", (token,))
        session = cursor.fetchone()

        if not session: raise HTTPException(status_code=404, detail="Session not found")

        if session['status'] == 'success':
            # Create a 3-hour expiry timestamp for the frontend
            expires_at = int((datetime.now() + timedelta(hours=3)).timestamp() * 1000)
            return {"status": "success", "target_view": session['target_view'], "expires_at": expires_at}

        return {"status": "pending"}
    finally:
        conn.close()
