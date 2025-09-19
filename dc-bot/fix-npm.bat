@echo off
echo === NPM 修復工具 ===
taskkill /f /im OneDrive.exe
taskkill /f /im Code.exe
echo 刪除 node_modules 和 package-lock.json ...
rmdir /s /q node_modules
del /f /q package-lock.json
echo 重新安裝依賴 ...
npm install
echo 安裝 @napi-rs/canvas ...
npm install @napi-rs/canvas
echo 完成！
pause
