@echo off
echo Starting Medication Error Audit API Server...
cd backend\app
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
