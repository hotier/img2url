# Img2URL

基于 Cloudflare R2 的免费图片托管服务，支持快速上传图片生成 URL，永久存储，无需注册。

## 特点

- **免费托管** - 基于 Cloudflare R2，无流量费用
- **永久存储** - 图片永久保存，支持设置过期时间
- **批量上传** - 支持拖拽、粘贴、点击选择多种上传方式
- **短链接** - 自动生成 7 位短链接，方便分享
- **WebP 格式** - 自动转换为 WebP 格式，节省存储空间
- **API 支持** - 提供 RESTful API，方便集成
- **响应式设计** - 支持桌面和移动端
- **数据统计** - 实时显示存储用量和图片数量

## 技术栈

- **前端**: React + Vite + Bootstrap
- **后端**: Cloudflare Pages Functions
- **存储**: Cloudflare R2
- **部署**: GitHub Actions

## 部署步骤

### 1. Fork 仓库

Fork 本仓库到你的 GitHub 账户。

### 2. 创建 Cloudflare R2 存储桶

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 R2 页面，创建存储桶
3. 记录存储桶名称

### 3. 创建 Cloudflare API Token

1. 进入 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. 点击 "Create Token"
3. 选择 "Custom token"
4. 添加以下权限：
   - `Account Settings - Read`
   - `Workers R2 Storage - Read`
   - `Workers R2 Storage - Edit`
   - `Workers Scripts - Read`
   - `Workers Scripts - Edit`
   - `Pages - Read`
   - `Pages - Edit`
5. 创建并复制 Token

### 4. 获取 Cloudflare Account ID

在 Cloudflare Dashboard 右侧边栏找到 Account ID。

### 5. 配置 GitHub Secrets

进入你 Fork 的仓库 → Settings → Secrets and variables → Actions

**添加 Secrets（机密）**:

| Name | Value |
|------|-------|
| `CLOUDFLARE_API_TOKEN` | 你的 Cloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | 你的 Cloudflare Account ID |

**添加 Variables（变量）**:

| Name | Value |
|------|-------|
| `R2_BUCKET_NAME` | 你的 R2 存储桶名称（可选，默认 `img2url-images`） |

### 6. 部署

推送代码到 `main` 分支，GitHub Actions 会自动部署到 Cloudflare Pages。

或者手动触发：Actions → Deploy to Cloudflare Pages → Run workflow

### 7. 配置自定义域名（可选）

1. 进入 Cloudflare Pages 项目
2. Settings → Custom domains → Add domain
3. 按提示添加域名解析

## API 文档

### 上传图片

```bash
curl -X POST https://your-domain.com/upload \
  -H "Content-Type: multipart/form-data" \
  -F "file=@image.jpg"
```

响应：
```json
{
  "success": true,
  "data": {
    "url": "https://your-domain.com/file/abc123",
    "fileName": "abc123",
    "originalName": "image.jpg",
    "size": 102400,
    "type": "image/jpeg",
    "uploadedAt": "2026-04-16 15:30:00(CST)"
  }
}
```

### 获取统计信息

```bash
curl https://your-domain.com/stats
```

响应：
```json
{
  "success": true,
  "data": {
    "totalImages": 100,
    "totalSize": 314572800,
    "totalSizeHuman": "300 MB",
    "usagePercent": 2.93,
    "timestamp": "2026-04-16 15:30:00(CST)"
  }
}
```

### 健康检查

```bash
curl https://your-domain.com/health
```

## 本地开发

```bash
# 安装依赖
npm install

# 创建本地配置
cp wrangler.toml wrangler.local.toml
# 编辑 wrangler.local.toml，配置你的 R2 存储桶

# 创建环境变量
cp .env.example .dev.vars
# 编辑 .dev.vars，填入你的 Cloudflare API Token 和 Account ID

# 启动开发服务器
npm run dev
```

## 环境变量

| 变量名 | 说明 | 必需 |
|--------|------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token | 是 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID | 是 |
| `TURNSTILE_SECRET_KEY` | Turnstile 验证密钥 | 否 |
| `CUSTOM_DOMAIN` | 自定义域名 | 否 |

## 许可证

MIT License
