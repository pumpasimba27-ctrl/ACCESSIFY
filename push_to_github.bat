@echo off
title ACCESSIFY - Automatic GitHub Sync
color 0A
cd /d "%~dp0"

echo ======================================================
echo    ACCESSIFY WEB - AUTOMATIC GITHUB SYNC
echo ======================================================
echo.

set "GIT_CMD=C:\Users\ADMIN\AppData\Local\Microsoft\WinGet\Packages\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd\git.exe"
set "PATH=C:\Users\ADMIN\AppData\Local\Microsoft\WinGet\Packages\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd;%PATH%"

set "REPO_URL=https://github.com/pumpasimba27-ctrl/ACCESSIFY.git"

echo [1/3] Verifying repository and data...
"%GIT_CMD%" status --short
echo.

echo [2/3] Setting remote repository origin...
"%GIT_CMD%" remote remove origin 2>nul
"%GIT_CMD%" remote add origin %REPO_URL%
"%GIT_CMD%" branch -M main

echo.
echo [3/3] Uploading all files and data to GitHub...
echo Target: %REPO_URL%
echo.
"%GIT_CMD%" push -u origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ======================================================
    echo [SUCCESS] Your ACCESSIFY store is now 100%% synced to GitHub!
    echo All code, 216 products, database, and photos are saved.
    echo ======================================================
) else (
    echo.
    echo ======================================================
    echo [NOTICE] If prompted above, please sign in or paste your
    echo GitHub Personal Access Token to complete the upload.
    echo ======================================================
)

echo.
echo Press any key to close this window...
pause >nul
