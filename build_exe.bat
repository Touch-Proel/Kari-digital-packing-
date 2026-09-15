@echo off
title Build POS Agent Standalone EXE
color 0B
echo =========================================================================
echo 📦 KARI ARNETT POS - BUILDING STANDALONE POS_AGENT.EXE
echo =========================================================================
echo.

:: 1. Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ [ERROR] Python មិនទាន់បានដំឡើងលើ PC នេះនៅឡើយទេ!
    echo សូមដំឡើង Python លើ PC នេះជាមុនសិន ដើម្បីផ្លាស់ប្តូរវាទៅជា EXE File។
    pause
    exit /b
)

echo ⏳ [1/3] កំពុងដំឡើង PyInstaller Tool...
python -m pip install pyinstaller --quiet

echo ⏳ [2/3] កំពុង Convert pos_agent.py ទៅជា POS_Agent.exe...
pyinstaller --noconfirm --onefile --console --name "POS_Agent" pos_agent.py

echo.
if exist "dist\POS_Agent.exe" (
    echo =========================================================================
    echo ✅ ជោគជ័យ! លោកអ្នកទទួលបានឯកសារ EXE ផ្លូវការនៅទីនេះ ៖
    echo 📁 dist\POS_Agent.exe
    echo =========================================================================
    echo.
    echo 💡 លោកអ្នកអាចចម្លង (Copy) ឯកសារ "POS_Agent.exe" នៅក្នុង Folder "dist"
    echo    ទៅដាក់លើ PC ឬ Laptop ផ្សេងទៀតក្នុងហាង ហើយចុច Double-Click រ៉ាន់បានភ្លាម!
    echo    (PC ផ្សេងទៀតនោះ មិនបាច់ដំឡើង Python ឬទាមទារការកំណត់អ្វីឡើយ!)
    echo.
) else (
    echo ❌ បង្កើតមិនបានសម្រេច! សូមពិនិត្យមើលសារ Error ខាងលើ។
)

pause
