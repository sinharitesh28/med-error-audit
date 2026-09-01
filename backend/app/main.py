from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="Medication Error Audit API", version="1.0.0")

# Import and include routers
from routes.audit import router as audit_router
app.include_router(audit_router)


# Allow frontend to communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for development
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

@app.get("/ping")
def health_check():
    return {"status": "ok", "message": "Medication Error Audit API is running"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

import asyncio
from telegram_bot import start_bot

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(start_bot())

# Mount frontend statically
import os
frontend_path = os.path.join(os.path.dirname(__file__), "../../frontend")
app.mount("/static", StaticFiles(directory=frontend_path), name="static")

@app.get("/")
def read_root():
    return RedirectResponse(url="/static/index.html")
