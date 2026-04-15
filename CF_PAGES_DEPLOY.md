# Cloudflare Pages 部署指南

## 概述

本指南将帮助你将 Img2URL 项目部署到 Cloudflare Pages，包括：
- 前端静态文件部署
- Cloudflare Functions（API 后端）部署
- Cloudflare R2 存储桶配置
- 环境变量配置

## 🚀 快速开始（3 种方式）

### 方式 1：GitHub Actions 自动部署（推荐）⭐

适合：已经绑定 GitHub 仓库的项目

```bash
# 1. 配置 GitHub Secrets（详见 GITHUB_ACTIONS_SECRETS.md）
# 2. 推送代码到 main 分支
git push origin main

# 自动触发部署！
```

**优点**：
- ✅ 自动触发，无需手动操作
- ✅ 每次推送代码自动部署
- ✅ 回滚功能

**详见**：[GitHub Actions Secrets 配置指南](./GITHUB_ACTIONS_SECRETS.md)

---

### 方式 2：一键部署脚本

适合：本地快速部署测试

```bash
deploy.bat          # Windows
deploy.sh           # macOS/Linux
```

**优点**：
- ✅ 一键完成所有步骤
- ✅ 自动创建 R2 存储桶
- ✅ 自动部署

**详见**：[QUICKSTART.md](./QUICKSTART.md)

---

### 方式 3：手动部署

适合：熟悉 Wrangler 的用户

```bash
npm install
npm run build
wrangler pages deploy dist
```

**优点**：
- ✅ 完全控制部署过程
- ✅ 适合调试

---

## 前置要求

1. ✅ Cloudflare 账号（免费即可）
2. ✅ Node.js 和 npm
3. ✅ Wrangler CLI：`npm install -g wrangler`

## 快速部署步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 构建

```bash
npm run build
```

这将构建前端并复制 Functions 到 `dist/functions/` 目录。

### 3. 登录 Cloudflare

```bash
wrangler login
```

### 4. 创建 R2 存储桶

```bash
wrangler r2 bucket create img2url-images
```

### 5. 部署到 Cloudflare Pages

```bash
npm run deploy
```

或者使用单独命令：

```bash
wrangler pages deploy dist
```

## 详细配置步骤

### 第一步：创建 R2 存储桶

R2 是 Cloudflare 的对象存储服务，用于存储图片。

```bash
wrangler r2 bucket create img2url-images
```

> **提示**：如果你已经有了 R2 存储桶，可以跳过此步。

### 第二步：配置环境变量

在部署前，需要在 Cloudflare Pages 项目中配置以下环境变量。

#### 通过 Wrangler 配置（推荐）

```bash
wrangler pages secret put R2_BUCKET_NAME --project-name img2url
wrangler pages secret put TURNSTILE_SECRET_KEY --project-name img2url
wrangler pages secret put R2_S3_ACCESS_KEY_ID --project-name img2url
wrangler pages secret put R2_S3_SECRET_ACCESS_KEY --project-name img2url
wrangler pages secret put R2_S3_ENDPOINT --project-name img2url
```

#### 通过 Cloudflare Dashboard 配置

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages** > **img2url** 项目
3. 点击 **Settings** > **Environment variables**
4. 添加以下环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `R2_BUCKET_NAME` | `img2url-images` | R2 存储桶名称 |
| `TURNSTILE_SECRET_KEY` | `your-secret-key` | Cloudflare Turnstile 密钥（可选） |
| `R2_S3_ACCESS_KEY_ID` | `your-access-key` | R2 S3 兼容 API 访问密钥 |
| `R2_S3_SECRET_ACCESS_KEY` | `your-secret-key` | R2 S3 兼容 API 密钥 |
| `R2_S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` | R2 S3 兼容 API 端点 |

> **注意**：R2 S3 兼容 API 端点格式为：`https://<account-id>.r2.cloudflarestorage.com`
>
> 你可以在 R2 存储桶的 **Settings** > **General** 中找到你的 Account ID。

### 第三步：配置 Turnstile 验证码（可选）

为了防止滥用，可以启用 Cloudflare Turnstile 人机验证。

1. 访问 [Turnstile Dashboard](https://dash.cloudflare.com/?to=/:account/turnstile/sites)
2. 创建新站点
3. 获取 Site Key 和 Secret Key
4. 在 Cloudflare Pages 环境变量中配置：
   - `TURNSTILE_SITE_KEY`：你的 Site Key
   - `TURNSTILE_SECRET_KEY`：你的 Secret Key

### 第四步：部署

```bash
# 方式 1：使用 npm 脚本
npm run deploy

# 方式 2：使用 wrangler
wrangler pages deploy dist

# 方式 3：从 Git 仓库部署（推荐）
git add .
git commit -m "Deploy to Cloudflare Pages"
git push origin main
```

### 第五步：配置自定义域名（可选）

1. 在 Cloudflare Pages 项目中进入 **Custom domains**
2. 点击 **Set up a custom domain**
3. 输入你的域名（如 `img.yourdomain.com`）
4. 在 Cloudflare DNS 设置中添加 CNAME 记录

### 第六步：配置路由规则

确保前端和 Functions 在同一域名下，Cloudflare Pages 会自动处理路由。

**默认路由**：
- 前端：`https://img2url.pages.dev/`
- API：`https://img2url.pages.dev/upload`、`/i/` 等

**自定义域名路由**：
- 前端：`https://yourdomain.com/`
- API：`https://yourdomain.com/upload`、`/i/` 等

## 目录结构

部署后的目录结构应该是：

```
dist/
├── assets/              # 前端静态资源
├── index.html          # 主页面
├── _worker.js          # Workers 入口（如果需要）
└── functions/          # Cloudflare Functions
    ├── worker.js       # API 处理函数
    └── _worker.js      # Workers 导出
```

## 环境变量配置

### 必需的环境变量

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `R2_BUCKET_NAME` | R2 存储桶名称 | `img2url-images` |
| `R2_S3_ACCESS_KEY_ID` | R2 S3 兼容 API 访问密钥 ID | `your-access-key` |
| `R2_S3_SECRET_ACCESS_KEY` | R2 S3 兼容 API 密钥 | `your-secret-key` |
| `R2_S3_ENDPOINT` | R2 S3 兼容 API 端点 | `https://<account-id>.r2.cloudflarestorage.com` |

### 可选的环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `TURNSTILE_SITE_KEY` | Turnstile 网站密钥 | - |
| `TURNSTILE_SECRET_KEY` | Turnstile 密钥 | - |
| `CUSTOM_DOMAIN` | 自定义域名 | `https://img2url.pages.dev` |

## 环境变量获取

### 获取 R2 S3 兼容 API 密钥

1. 进入 Cloudflare Dashboard > R2
2. 点击 **Manage R2 API Tokens**
3. 创建新的 API Token（需要以下权限）：
   - **List Bucket Objects**：List
   - **Get Bucket Object**：Read
   - **Put Bucket Object**：Write
   - **Delete Bucket Object**：Delete
4. 复制 Access Key ID 和 Secret Access Key

### 获取 R2 S3 兼容 API 端点

1. 进入 Cloudflare Dashboard > R2
2. 点击你的存储桶（如 `img2url-images`）
3. 在 **Settings** > **General** 中找到 **S3 Compatibility** 部分
4. 复制 **Endpoint** URL

## 本地开发

### 启动开发服务器

```bash
npm run dev
```

这将启动：
- Vite 开发服务器：`http://localhost:3000`
- Wrangler 开发服务器：`http://localhost:8787`

前端会通过 Vite 代理将 API 请求转发到本地后端。

### 测试 API

```bash
# 健康检查
curl http://localhost:8787/health

# 上传图片（需要创建 test-image.png）
curl -X POST http://localhost:8787/upload \
  -F "file=@test-image.png"
```

## 故障排查

### 1. 405 错误

**原因**：API 请求方法不被允许

**解决方案**：
- 确保前端使用相对路径 `/upload`，而不是绝对 URL
- 检查 `config.js` 中的 `API_URL` 为空字符串
- 确保 Functions 已正确复制到 `dist/functions/`

### 2. 404 错误

**原因**：请求路径不存在

**解决方案**：
- 确认前端和 Functions 在同一域名下
- 检查浏览器控制台中的请求 URL
- 查看 Cloudflare Pages 日志

### 3. R2 存储错误

**原因**：无法访问 R2 存储桶

**解决方案**：
- 确认 `R2_BUCKET_NAME` 环境变量正确
- 确认 R2 S3 API 密钥和端点正确
- 检查 R2 存储桶权限设置

### 4. 500 错误

**原因**：服务器内部错误

**解决方案**：
- 查看 Cloudflare Pages 日志
- 检查环境变量是否正确设置
- 确认 R2 存储桶存在且有权限

## 监控和维护

### 查看日志

```bash
wrangler pages deployment tail --project-name img2url
```

### 查看统计信息

在 Cloudflare Dashboard > Workers & Pages > img2url 中查看：
- 访问统计
- 错误日志
- 性能指标

### 清理过期图片

项目包含自动清理功能，但也可以手动清理：

```bash
# 列出所有图片
wrangler r2 object list img2url-images

# 删除指定图片
wrangler r2 object delete img2url-images <filename>
```

## 成本说明

Cloudflare Pages 免费计划包含：
- 500 次免费构建/月
- 100GB 带宽/月
- 1,000 次请求/秒

Cloudflare R2 免费计划包含：
- 10GB 存储空间
- 1,000,000 次读取/月

## 常见问题

### Q: 是否需要单独部署 Worker？

A: 不需要。Cloudflare Pages 自动处理 Workers 和 Functions。只需构建并将 `dist/functions/` 目录部署即可。

### Q: 如何更新部署？

A: 重新运行 `npm run build && wrangler pages deploy dist` 或推送新的 Git commit。

### Q: 如何回滚到之前的版本？

A: 在 Cloudflare Dashboard > Workers & Pages > img2url 中选择 **Deployments**，点击要回滚的版本。

### Q: 上传失败怎么办？

A:
1. 检查浏览器控制台错误信息
2. 查看 Cloudflare Pages 日志
3. 确认环境变量正确配置
4. 确认 R2 存储桶存在且有权限

## GitHub Actions 自动部署（推荐）⭐

### 概述

使用 GitHub Actions 可以实现代码推送后自动部署，无需手动操作。

### 配置步骤

1. **配置 GitHub Secrets**
   - 详见：[GitHub Actions Secrets 配置指南](./GITHUB_ACTIONS_SECRETS.md)

2. **推送代码触发部署**

   ```bash
   git add .
   git commit -m "Deploy via GitHub Actions"
   git push origin main
   ```

3. **查看部署状态**
   - 访问 GitHub 仓库的 **Actions** 页面
   - 点击 **Deploy to Cloudflare Pages** workflow

### 配置的 Secrets

需要在 GitHub 仓库中添加以下 Secrets：

| Secret 名称 | 说明 | 获取方式 |
|-------------|------|----------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token | Cloudflare Dashboard > My Profile > API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID | Cloudflare Dashboard > Account ID |

### 自动部署的好处

- ✅ **自动触发**：推送代码即自动部署
- ✅ **版本控制**：每次部署都有记录
- ✅ **快速回滚**：可以轻松回滚到任何历史版本
- ✅ **无需手动**：完全自动化流程

### 手动触发部署

如果需要手动触发部署：

1. 进入 GitHub 仓库的 **Actions** 页面
2. 选择 **Deploy to Cloudflare Pages**
3. 点击右侧的 **Run workflow** 按钮
4. 选择分支并点击 **Run workflow**

---

## 更多资源

- [GitHub Actions Secrets 配置指南](./GITHUB_ACTIONS_SECRETS.md)
- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Cloudflare Functions 文档](https://developers.cloudflare.com/workers/)
- [Cloudflare R2 文档](https://developers.cloudflare.com/r2/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [快速开始指南](./QUICKSTART.md)
