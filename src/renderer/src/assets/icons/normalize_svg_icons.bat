@echo off
setlocal
set "PYTHONUTF8=1"
python "%~dp0normalize_svg_icons.py" --write %*
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
