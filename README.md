# Img2URL - 图片转URL服务

基于Cloudflare R2的免费图片托管服务，支持快速上传图片生成URL，永久存储，无需注册，支持批量上传，API接口，适用于博客、论坛、社交媒体等场景。

## 功能特性

- ✅ 免费图片托管
- ✅ 支持多种图片格式（JPG、PNG、GIF、WebP等）
- ✅ 自动压缩图片（GIF保持原格式）
- ✅ 支持设置图片有效期
- ✅ 防重复上传（基于文件哈希）
- ✅ 访问频率限制
- ✅ 存储空间监控
- ✅ API接口支持
- ✅ 短链接访问
- ✅ 定时清理过期图片

## 快速开始

### Cloudflare Pages 部署（推荐）

```bash
# 下载并运行部署脚本
deploy.bat          # Windows
deploy.sh           # macOS/Linux

# 或手动部署
npm install
npm run build
wrangler pages deploy dist
```

详细部署指南请查看 [Cloudflare Pages 部署文档](./CF_PAGES_DEPLOY.md)

## 技术栈

- **前端**：React + Vite
- **后端**：Cloudflare Workers
- **存储**：Cloudflare R2
- **缓存**：Cloudflare KV

## 部署步骤

### 1. 准备工作

1. 注册Cloudflare账号
2. 创建R2存储桶，命名为 `img2url-images`
3. 创建KV命名空间，用于存储元数据和统计信息
4. 生成Cloudflare API Token，需要以下权限：
   - Workers Scripts: Edit
   - R2: Edit
   - KV: Edit
   - Pages: Edit

### 2. 配置环境变量

在GitHub仓库的Settings > Secrets and variables > Actions中添加以下 secrets：

- `CLOUDFLARE_API_TOKEN` - Cloudflare API Token
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare账号ID

### 3. 自动部署

1. 将代码推送到GitHub仓库的main分支
2. GitHub Actions会自动执行部署流程：
   - 安装依赖
   - 构建前端项目
   - 部署Worker到Cloudflare
   - 部署前端到Cloudflare Pages

### 4. 配置Worker环境变量

在Cloudflare Workers控制台中，为worker添加以下环境变量：

- `TURNSTILE_SECRET_KEY` - Cloudflare Turnstile密钥（可选，用于人机验证）
- `R2_S3_ACCESS_KEY_ID` - R2 S3兼容API访问密钥
- `R2_S3_SECRET_ACCESS_KEY` - R2 S3兼容API密钥
- `R2_S3_ENDPOINT` - R2 S3兼容API端点
- `R2_BUCKET_NAME` - R2存储桶名称

### 5. 配置自定义域名

在Cloudflare Pages和Workers中配置自定义域名：

- 前端：`https://img.hotier.cc.cd`
- API：`https://api.hotier.cc.cd`

## API文档

### 上传图片

**POST /upload**

参数：
- `file` - 图片文件（必填）
- `expiration` - 有效期天数（可选，0=永久）
- `turnstile` - Cloudflare Turnstile验证码token（高频率上传时必填）

响应：
```json
{
  "success": true,
  "code": 200,
  "data": {
    "url": "https://api.hotier.cc.cd/4345c068.webp",
    "fileName": "4345c068.webp",
    "size": 1042,
    "type": "image/png",
    "timestamp": "2026-03-02 20:46:57",
    "expirationTime": null,
    "expirationDays": null,
    "remainingUploads": 497
  }
}
```

### 获取统计信息

**GET /stats**

响应：
```json
{
  "success": true,
  "data": {
    "images": 100,
    "totalSize": 1234567890,
    "totalSizeFormatted": "1.15 GB",
    "storageUsage": 11.5,
    "readCount": 50000,
    "readLimit": 1000000,
    "readUsage": 5,
    "limits": {
      "storage": "10.00 GB",
      "read": 1000000
    },
    "warnings": []
  },
  "cached": false
}
```

## 本地开发

### 启动开发服务器

```bash
npm run dev
```

### 构建生产版本

```bash
npm run deploy:client  # 构建前端
npm run deploy:worker  # 部署worker
```

## 限制说明

- 单个文件大小限制：10MB
- 图片尺寸限制：10000x10000
- 每日上传限制：500次/IP
- 每分钟上传限制：30次/IP
- 每分钟读取限制：100次/IP
- 总存储空间限制：10GB
- 每日读取限制：100万次

## 注意事项

1. 请遵守相关法律法规，不要上传违法违规内容
2. 大文件上传可能会比较慢，请耐心等待
3. 存储空间达到90%时会暂停上传服务
4. 高频率上传需要进行人机验证

## 许可证

MIT License
