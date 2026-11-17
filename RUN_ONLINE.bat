@echo off
chcp 65001 >nul
title ระบบลงพิกัดบ่อเลี้ยงปลาและฐานข้อมูลเกษตรกร (Fish Farm GIS)
cd /d "C:\Users\Studio Demo\Documents\Codex"

echo ====================================================================
echo   🐟 ระบบลงพิกัดบ่อเลี้ยงปลา & ฐานข้อมูลเกษตรกร (Fish Farm GIS)
echo ====================================================================
echo.
echo [1/2] กำลังเปิดเซิร์ฟเวอร์หลัก (Local Server Port 8000)...
start "FishFarm-Server" /min cmd /c "python -m uvicorn app:app --host 0.0.0.0 --port 8000 --app-dir fish_farm_tracker"

timeout /t 3 /nobreak >nul

echo [2/2] กำลังเชื่อมต่อระบบออนไลน์ภายนอก (Cloudflare Tunnel)...
start "FishFarm-Tunnel" cmd /k ".\cloudflared.exe tunnel --url http://127.0.0.1:8000"

exit
