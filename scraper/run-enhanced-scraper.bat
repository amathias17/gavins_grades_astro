@echo off
if not defined SKYWARD_USERNAME (
  echo SKYWARD_USERNAME is not set.
  echo Set it in this terminal before running the scraper.
  pause
  exit /b 1
)
if not defined SKYWARD_PASSWORD (
  echo SKYWARD_PASSWORD is not set.
  echo Set it in this terminal before running the scraper.
  pause
  exit /b 1
)
node enhanced-scraper.cjs
pause
