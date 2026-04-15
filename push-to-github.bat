@echo off
REM Img2URL 推送到 GitHub 脚本 (Windows)

echo 🚀 Img2URL GitHub 部署助手
echo.

REM 检查是否是 Git 仓库
git rev-parse --is-inside-work-tree >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  当前目录不是 Git 仓库
    echo.
    echo 请先初始化 Git 仓库：
    echo   git init
    echo   git commit -m "Initial commit"
    echo   git branch -M main
    echo   git remote add origin https://github.com/YOUR_USERNAME/img2url.git
    echo   git push -u origin main
    pause
    exit /b 1
)

echo 请输入你的 GitHub 用户名：
set /p GITHUB_USERNAME=

REM 检查是否已配置 remote
git remote | findstr /i "origin" >nul
if %errorlevel% equ 0 (
    echo ✅ 已检测到 remote origin
    echo 当前 remote: git remote get-url origin
) else (
    echo ⚠️  未检测到 remote origin
    echo 请输入你的 GitHub 仓库地址：
    echo 示例: https://github.com/YOUR_USERNAME/img2url.git
    set /p REPO_URL=

    if "%REPO_URL%"=="" (
        echo ❌ 仓库地址不能为空
        pause
        exit /b 1
    )

    git remote add origin %REPO_URL%
    echo ✅ 已添加 remote origin
)

REM 获取当前分支
for /f "tokens=*" %%i in ('git branch --show-current') do set CURRENT_BRANCH=%%i
echo 当前分支: %CURRENT_BRANCH%

REM 提交更改
echo.
echo 📦 检查更改...
git status --short

git diff --quiet && git diff --cached --quiet
if %errorlevel% equ 0 (
    echo ✅ 没有更改需要提交
) else (
    echo.
    echo 📝 提交更改...
    git add .
    git commit -m "Auto commit: %date% %time%"
    echo ✅ 已提交更改
)

REM 推送代码
echo.
echo ☁️  推送到 GitHub...
git push origin %CURRENT_BRANCH%

if %errorlevel% equ 0 (
    echo.
    echo ✅ 推送成功！
    echo.
    echo 📋 下一步：
    echo 1. 配置 GitHub Secrets:
    echo    访问: https://github.com/%GITHUB_USERNAME%/img2url/settings/secrets/actions
    echo    添加: CLOUDFLARE_API_TOKEN 和 CLOUDFLARE_ACCOUNT_ID
    echo.
    echo 2. 查看部署状态:
    echo    访问: https://github.com/%GITHUB_USERNAME%/img2url/actions
    echo.
    echo 📚 文档：
    echo    - PUSH_TO_GITHUB.md
    echo    - GITHUB_ACTIONS_SECRETS.md
    echo    - CF_PAGES_DEPLOY.md
) else (
    echo.
    echo ❌ 推送失败，请检查错误信息
    pause
    exit /b 1
)

pause
