@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "FRAME_FOUND_PYTHON="

for /f "delims=" %%P in ('where python.exe 2^>nul') do call :probe "%%P"
for /f "delims=" %%P in ('where py.exe 2^>nul') do if not defined FRAME_FOUND_PYTHON call :probe_launcher "%%P"
for /f "usebackq delims=" %%P in (`cscript.exe //nologo "%~dp0find-python.vbs" 2^>nul`) do if not defined FRAME_FOUND_PYTHON call :probe "%%P"

if not defined FRAME_FOUND_PYTHON call :probe "C:\Users\Пользователь\AppData\Local\Programs\Python\Python312\python.exe"
if not defined FRAME_FOUND_PYTHON call :probe "C:\Program Files\Python312\python.exe"
if not defined FRAME_FOUND_PYTHON call :probe "C:\Program Files\Python311\python.exe"
if not defined FRAME_FOUND_PYTHON call :bootstrap_embed

if not defined FRAME_FOUND_PYTHON (
  echo FRAME Python executable was not found. 1>&2
  exit /b 1
)

for %%I in ("%FRAME_FOUND_PYTHON%") do set "FRAME_FOUND_PYTHON=%%~sI"
"%FRAME_FOUND_PYTHON%" -X utf8 -c "import sys; print(sys.executable)"
if errorlevel 1 exit /b 1
>>"%GITHUB_ENV%" echo FRAME_PYTHON=%FRAME_FOUND_PYTHON%
echo FRAME Python resolved without setup-python: %FRAME_FOUND_PYTHON%
endlocal & set "FRAME_PYTHON=%FRAME_FOUND_PYTHON%"
exit /b 0

:bootstrap_embed
set "FRAME_EMBED_ROOT=%RUNNER_TEMP%\frame-python-embed-3.12.10"
set "FRAME_EMBED_ZIP=%RUNNER_TEMP%\frame-python-embed-3.12.10.zip"
if not exist "%FRAME_EMBED_ROOT%\python.exe" (
  if not exist "%FRAME_EMBED_ROOT%" mkdir "%FRAME_EMBED_ROOT%"
  curl.exe --fail --location --retry 3 --connect-timeout 20 --output "%FRAME_EMBED_ZIP%" "https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip"
  if errorlevel 1 exit /b 0
  tar.exe -xf "%FRAME_EMBED_ZIP%" -C "%FRAME_EMBED_ROOT%"
  if errorlevel 1 exit /b 0
  del "%FRAME_EMBED_ZIP%" >nul 2>nul
)
call :probe "%FRAME_EMBED_ROOT%\python.exe"
exit /b 0

:probe
if defined FRAME_FOUND_PYTHON exit /b 0
if not exist "%~1" exit /b 0
"%~1" -X utf8 -c "import sys; raise SystemExit(0 if sys.version_info[:2] >= (3, 11) else 1)" >nul 2>nul
if not errorlevel 1 set "FRAME_FOUND_PYTHON=%~1"
exit /b 0

:probe_launcher
if defined FRAME_FOUND_PYTHON exit /b 0
"%~1" -3.12 -X utf8 -c "import sys; print(sys.executable)" >"%TEMP%\frame-python-path.txt" 2>nul
if errorlevel 1 exit /b 0
set /p FRAME_FOUND_PYTHON=<"%TEMP%\frame-python-path.txt"
del "%TEMP%\frame-python-path.txt" >nul 2>nul
exit /b 0
