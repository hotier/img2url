#!/bin/bash

# Img2URL Cloudflare Pages 快速部署脚本

echo "🚀 开始部署 Img2URL 到 Cloudflare Pages..."

# 1. 安装依赖
echo "📦 安装依赖..."
npm install

# 2. 构建
echo "🔨 构建项目..."
npm run build

# 3. 登录 Cloudflare
echo "🔐 登录 Cloudflare..."
wrangler login

# 4. 创建 R2 存储桶
echo "🗄️  创建 R2 存储桶..."
wrangler r2 bucket create img2url-images

# 5. 部署到 Cloudflare Pages
echo "☁️  部署到 Cloudflare Pages..."
wrangler pages deploy dist

echo "✅ 部署完成！"
echo ""
echo "📋 接下来需要配置的环境变量："
echo "   R2_BUCKET_NAME = img2url-images"
echo "   R2_S3_ACCESS_KEY_ID = <你的AccessKey>"
echo "   R2_S3_SECRET_ACCESS_KEY = <你的SecretKey>"
echo "   R2_S3_ENDPOINT = https://<account-id>.r2.cloudflarestorage.com"
echo ""
echo "请在 Cloudflare Dashboard 中配置这些环境变量。"
