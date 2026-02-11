# 部署指南

## 前置准备

1. 注册 Cloudflare 账号（免费）
2. 安装 Node.js 和 npm
3. 安装 Wrangler CLI：
```bash
npm install -g wrangler
```

## 步骤 1：创建 R2 存储桶

```bash
wrangler r2 bucket create img2url-images
```

## 步骤 2：配置自定义域名（可选）

在 Cloudflare 控制台中，为 R2 存储桶配置自定义域名以直接访问图片。

## 步骤 3：部署 Workers

```bash
cd worker
npm install
wrangler deploy
```

## 步骤 4：部署前端到 Pages

方式 1：使用 Wrangler
```bash
cd client
npm install
npm run build
wrangler pages deploy dist
```

方式 2：通过 Cloudflare 控制台连接 Git 仓库

## 步骤 5：配置环境变量

在 wrangler.toml 中更新：
- `CORS_ORIGIN`：设置为你的 Pages 域名
- 更新 `bucket_name` 为你的实际存储桶名称

## 本地开发

```bash
npm install
npm run dev
```

访问 http://localhost:3000