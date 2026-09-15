@echo off
title KARI ARNETT POS - Shop Print Agent
color 0A
echo =========================================================================
echo 🏪 KARI ARNETT POS - SHOP PRINT AGENT (WINDOWS AUTO RUNNER)
echo =========================================================================
echo.

:: 1. Check if Python is installed
where python >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Python detected! Starting Print Agent...
    echo.
    python pos_agent.py
    pause
    exit /b
)

:: 2. Check if py command exists
where py >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Python Launcher detected! Starting Print Agent...
    echo.
    py pos_agent.py
    pause
    exit /b
)

:: 3. If Python is NOT installed
echo ❌ [ERROR] PC មិនទាន់មាន Python នៅឡើយទេ! (Python is not installed)
echo.
echo 💡 វិធីដោះស្រាយ (២ ជម្រើស) ៖
echo -------------------------------------------------------------------------
echo [1] ដំឡើង Python ស្វ័យប្រវត្តិ (Auto Install via Winget - ចុចលេខ 1)
echo [2] បើកគេហទំព័រទាញយក Python ផ្លូវការ (python.org - ចុចលេខ 2)
echo [3] ចាកចេញ (Exit - ចុចលេខ 3)
echo -------------------------------------------------------------------------
echo.

set /p choice="សូមជ្រើសរើសជម្រើស [1, 2 ឬ 3] ៖ "

if "%choice%"=="1" (
    echo.
    echo 🚀 កំពុងដំឡើង Python 3 ស្វ័យប្រវត្តិ... សូមរង់ចាំ...
    winget install --id Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
    if %errorlevel% equ 0 (
        echo.
        echo ✅ បានដំឡើង Python ជោគជ័យ! កំពុងចាប់ផ្តើម Print Agent...
        python pos_agent.py
    ) else (
        echo ⚠️ ការដំឡើងតាម Winget មិនបានសម្រេច។ សូមទាញយក Python ដោយផ្ទាល់។
        start https://www.python.org/downloads/
    )
) else if "%choice%"=="2" (
    start https://www.python.org/downloads/
    echo 💡 សូមដំឡើង Python ហើយបើក "run_agent.bat" នេះឡើងវិញ!
) else (
    exit /b
)

pause
