@echo off
REM Deletes the old BB-internal-OS duplicate folder.
REM 1) Stop "npm run dev"  2) Close Cursor  3) Double-click this file

cd /d "%~dp0"
if exist "BB-internal-OS" (
  rmdir /s /q "BB-internal-OS"
  if exist "BB-internal-OS" (
    echo Could not delete — folder still in use. Reboot or close all terminals, then try again.
  ) else (
    echo Deleted BB-internal-OS. Project is now only AJ_Academy_OS and AJ_Academy_SB.
  )
) else (
  echo BB-internal-OS not found — already clean.
)
pause
