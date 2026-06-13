@echo off
title Python HTTP Server - Port 8000
echo Starting local HTTP server on http://localhost:8000
echo Serving files from: D:\PV-Collections
echo.
python -m http.server 8000
pause