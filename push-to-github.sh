#!/bin/bash

# Img2URL 推送到 GitHub 脚本

echo "🚀 Img2URL GitHub 部署助手"
echo ""

# 检查是否是 Git 仓库
if [ ! -d .git ]; then
    echo "⚠️  当前目录不是 Git 仓库"
    echo ""
    echo "请先初始化 Git 仓库："
    echo "  git init"
    echo "  git commit -m 'Initial commit'"
    echo "  git branch -M main"
    echo "  git remote add origin https://github.com/YOUR_USERNAME/img2url.git"
    echo "  git push -u origin main"
    exit 1
fi

# 获取用户输入
echo "请输入你的 GitHub 用户名："
read -r GITHUB_USERNAME

# 检查是否已配置 remote
if git remote | grep -q "origin"; then
    echo "✅ 已检测到 remote origin"
    echo "当前 remote: $(git remote get-url origin)"
else
    echo "⚠️  未检测到 remote origin"
    echo "请输入你的 GitHub 仓库地址（https://github.com/YOUR_USERNAME/img2url.git）："
    read -r REPO_URL

    if [ -z "$REPO_URL" ]; then
        echo "❌ 仓库地址不能为空"
        exit 1
    fi

    git remote add origin "$REPO_URL"
    echo "✅ 已添加 remote origin"
fi

# 获取当前分支
CURRENT_BRANCH=$(git branch --show-current)
echo "当前分支: $CURRENT_BRANCH"

# 提交更改
echo ""
echo "📦 检查更改..."
git status --short

if [ -z "$(git status --porcelain)" ]; then
    echo "✅ 没有更改需要提交"
else
    echo ""
    echo "📝 提交更改..."
    git add .
    git commit -m "Auto commit: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "✅ 已提交更改"
fi

# 推送代码
echo ""
echo "☁️  推送到 GitHub..."
git push origin "$CURRENT_BRANCH"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 推送成功！"
    echo ""
    echo "📋 下一步："
    echo "1. 配置 GitHub Secrets:"
    echo "   访问: https://github.com/$GITHUB_USERNAME/img2url/settings/secrets/actions"
    echo "   添加: CLOUDFLARE_API_TOKEN 和 CLOUDFLARE_ACCOUNT_ID"
    echo ""
    echo "2. 查看部署状态:"
    echo "   访问: https://github.com/$GITHUB_USERNAME/img2url/actions"
    echo ""
    echo "📚 文档："
    echo "   - PUSH_TO_GITHUB.md"
    echo "   - GITHUB_ACTIONS_SECRETS.md"
    echo "   - CF_PAGES_DEPLOY.md"
else
    echo ""
    echo "❌ 推送失败，请检查错误信息"
    exit 1
fi
