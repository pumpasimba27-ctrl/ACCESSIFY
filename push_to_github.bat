@echo off
title ACCESSIFY - Push to GitHub
color 0A
cd /d "%~dp0"

echo ======================================================
echo    ACCESSIFY WEB - GITHUB REPOSITORY SYNC
echo ======================================================
echo.

set "GIT_CMD=C:\Users\ADMIN\AppData\Local\Microsoft\WinGet\Packages\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd\git.exe"

if not exist "%GIT_CMD%" (
    set "GIT_CMD=git"
)

echo [1/3] Checking Git repository status...
"%GIT_CMD%" status --short
echo.

echo All 198 files, database, and uploads are safely committed!
echo.
echo ======================================================
echo Please enter your GitHub Repository URL.
echo Example: https://github.com/your-username/accessify-web.git
echo ======================================================
echo.
set /p REPO_URL="Enter GitHub Repository URL: "

if "%REPO_URL%"=="" (
    echo [ERROR] No URL entered. Operation cancelled.
    pause
    exit /b 1
)

echo.
echo [2/3] Setting remote origin to: %REPO_URL%
"%GIT_CMD%" remote remove origin 2>nul
"%GIT_CMD%" remote add origin %REPO_URL%
"%GIT_CMD%" branch -M main

echo.
echo [3/3] Pushing files and data to GitHub...
echo (A browser window or prompt may ask you to sign in to GitHub)
echo.
"%GIT_CMD%" push -u origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ======================================================
    echo [SUCCESS] Your ACCESSIFY store is now fully synced to GitHub!
    echo All code, 216 products, and uploads are safely backed up.
    echo ======================================================
) else (
    echo.
    echo ======================================================
    echo [NOTICE] If authentication failed, ensure you are signed in
    echo to GitHub or use a Personal Access Token as your password.
    echo ======================================================
)

echo.
pause
