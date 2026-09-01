import asyncio
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

# Import our modular routers
from routes import audit, auth
from telegram_bot import start_bot

app = FastAPI(title="Medication Error Audit API")

# Standard CORS policy
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Endpoints
app.include_router(audit.router)
app.include_router(auth.router)

# Setup Static Files for Cloud Deployment
BASE_DIR = Path(__file__).resolve().parent.parent.parent
frontend_path = BASE_DIR / "frontend"

if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")

@app.get("/")
def read_root():
    # Auto-redirect the root domain straight to the login page
    return RedirectResponse(url="/static/login.html")

@app.on_event("startup")
async def startup_event():
    # Start the Telegram bot in the background when the web server starts
    asyncio.create_task(start_bot())
