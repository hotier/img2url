@echo off
REM 获取 R2 Secrets 脚本

echo 🗄️  获取 R2 S3 API 凭证
echo.
echo 步骤 1: 访问 Cloudflare Dashboard
echo    https://dash.cloudflare.com/?to=/:account/r2
echo.
echo 步骤 2: 创建或获取 R2 API Token
echo    - 点击 "Manage R2 API Tokens"
echo    - 创建新 Token
echo    - 授予以下权限:
echo        List Bucket Objects    (List)
echo      Get Bucket Object      (Read)
echo      Put Bucket Object      (Write)
echo      Delete Bucket Object   (Delete)
echo.
echo 步骤 3: 获取 S3 Endpoint
echo    - 点击你的存储桶（img2url-images）
echo    - 进入 Settings ^> General
echo    - 找到 "S3 Compatibility" 部分
echo    - 复制 Endpoint URL
echo.
echo ========================================
echo.
echo 复制以下信息并保存:
echo.
echo R2_S3_ACCESS_KEY_ID = [从 Token 中复制]
echo R2_S3_SECRET_ACCESS_KEY = [从 Token 中复制]
echo R2_S3_ENDPOINT = [从 S3 Compatibility 中复制]
echo.
echo ========================================
echo.
echo 然后在 Cloudflare Pages 中配置这些环境变量:
echo    进入: https://dash.cloudflare.com/?to=/:account/pages/view/img2url/settings/environment-variables
echo.
pause
