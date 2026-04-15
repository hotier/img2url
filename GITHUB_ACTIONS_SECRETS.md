# GitHub Actions Secrets 配置指南

## 概述

本文档指导如何在 GitHub 仓库中配置 Secrets，以实现 Cloudflare Pages 的自动部署。

## 步骤 1：登录 GitHub

访问 [GitHub Dashboard](https://github.com/)

## 步骤 2：打开你的仓库

1. 进入你的仓库页面
2. 点击 **Settings** 标签

## 步骤 3：添加 Secrets

在左侧菜单中找到 **Secrets and variables** > **Actions**，然后点击 **New repository secret**

按以下顺序添加所有 Secrets：

### 必需的 Secrets

#### 1. `CLOUDFLARE_API_TOKEN`

**说明**：Cloudflare API Token，用于访问你的 Cloudflare 账号

**获取步骤**：
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 点击右上角的头像 > **My Profile**
3. 在 **API Tokens** 部分，点击 **Create Token**
4. 选择 **Edit Cloudflare Workers** 模板（或自定义权限）
5. 需要以下权限：
   - **Account** > **Workers Scripts**：Edit
   - **Account** > **R2**：Edit
   - **Zone** > **DNS**：Edit（可选，如果需要自定义域名）
6. 设置 Token 名称（如：`GitHub Actions - img2url`）
7. 点击 **Continue to summary** > **Create Token**
8. **重要：立即复制 Token**（只显示一次！）

**在 GitHub 中设置**：
```
Name: CLOUDFLARE_API_TOKEN
Value: 你的API_Token
```

---

#### 2. `CLOUDFLARE_ACCOUNT_ID`

**说明**：你的 Cloudflare Account ID

**获取步骤**：
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 在右侧栏中找到 **Account ID**（显示为 32 位字符）
3. 复制这个 ID

**在 GitHub 中设置**：
```
Name: CLOUDFLARE_ACCOUNT_ID
Value: 你的Account_ID
```

---

### 可选的 Secrets

#### 3. `GITHUB_TOKEN`

**说明**：GitHub 自动提供，无需手动设置

这个 token 由 GitHub Actions 自动提供，用于部署到 GitHub Pages。

---

## 快速配置脚本

### 方法 1：通过 GitHub Web UI（推荐）

1. 访问 `https://github.com/你的用户名/你的仓库/settings/secrets/actions`
2. 点击 **New repository secret**
3. 添加上面的 Secrets
4. 重复添加所有 Secrets

### 方法 2：通过 GitHub CLI

```bash
# 安装 GitHub CLI
# macOS
brew install gh

# Windows
winget install --id GitHub.cli

# 登录
gh auth login

# 设置 Secrets
gh secret set CLOUDFLARE_API_TOKEN
# 粘贴你的 API Token 后按 Ctrl+D

gh secret set CLOUDFLARE_ACCOUNT_ID
# 粘贴你的 Account ID 后按 Ctrl+D
```

---

## 验证配置

### 1. 查看 GitHub Actions 页面

1. 进入仓库首页
2. 点击 **Actions** 标签
3. 你应该能看到 **Deploy to Cloudflare Pages** workflow

### 2. 触发部署

在 GitHub 上推送到 `main` 分支会自动触发部署：

```bash
git add .
git commit -m "Update deploy workflow"
git push origin main
```

或者在 **Actions** 页面点击 **Deploy to Cloudflare Pages** > **Run workflow** > **Run workflow**

### 3. 查看部署日志

1. 进入 **Actions** 页面
2. 点击最近的 workflow 运行
3. 查看每个步骤的日志

**成功标志**：
- ✅ Checkout code
- ✅ Setup Node.js
- ✅ Install dependencies
- ✅ Build frontend
- ✅ Deploy to Cloudflare Pages

---

## 常见问题

### 1. Secret 未生效

**症状**：部署失败，提示 "API Token not found"

**解决**：
- 检查 Secret 名称是否完全匹配（区分大小写）
- 确认 Secret 值正确复制，没有多余空格
- 检查 GitHub Actions 权限设置

### 2. 部署失败

**症状**：Actions 显示错误

**解决步骤**：
1. 查看具体的错误信息
2. 检查 API Token 是否有足够权限
3. 检查 Account ID 是否正确
4. 确认 GitHub Actions 权限设置

### 3. 权限问题

**症状**：无法创建或修改 Secret

**解决**：
1. 进入 **Settings** > **Actions** > **General**
2. 在 **Workflow permissions** 部分
3. 选择 **Read and write permissions**
4. 勾选 **Allow GitHub Actions to create and approve pull requests**（可选）

### 4. Cloudflare Pages 项目不存在

**症状**：提示 "Project not found"

**解决**：
- 确认 `projectName: img2url` 中的项目名称正确
- 登录 Cloudflare Dashboard 确认项目存在
- 确认 API Token 有访问该项目的权限

---

## 安全注意事项

### ✅ 最佳实践

1. **使用最小权限原则**：API Token 只授予必要的权限
2. **定期轮换 Token**：建议每 3-6 个月更换一次 API Token
3. **不要在代码中暴露 Token**：始终使用 GitHub Secrets
4. **限制 API Token 的使用范围**：不要将 Token 分享给他人

### 🔒 Token 保护

- API Token 只显示一次，请立即保存
- 不要将 Token 提交到代码仓库
- 定期检查 Token 使用情况

---

## 部署后配置环境变量

部署成功后，还需要在 Cloudflare Pages 控制台中配置运行时环境变量：

### 必需的运行时环境变量

进入 Cloudflare Dashboard > Workers & Pages > img2url > Settings > Environment variables

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `R2_BUCKET_NAME` | `img2url-images` | R2 存储桶名称 |
| `R2_S3_ACCESS_KEY_ID` | - | R2 S3 API 访问密钥 |
| `R2_S3_SECRET_ACCESS_KEY` | - | R2 S3 API 密钥 |
| `R2_S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` | R2 S3 端点 |

### 获取 R2 S3 API 密钥

1. 进入 Cloudflare Dashboard > R2
2. 点击 **Manage R2 API Tokens**
3. 创建新 Token（需要 List、Read、Write、Delete 权限）
4. 复制 Access Key ID 和 Secret Access Key
5. 在 S3 Compatibility 中获取 Endpoint

---

## 测试部署

### 1. 推送代码触发部署

```bash
git add .
git commit -m "Deploy via GitHub Actions"
git push origin main
```

### 2. 监控部署状态

- 访问 GitHub 仓库的 **Actions** 页面
- 查看 workflow 执行状态

### 3. 访问部署的站点

- 前端：`https://img2url.pages.dev` 或你的自定义域名
- API：`https://img2url.pages.dev/upload` 等

### 4. 测试上传功能

1. 访问你的部署 URL
2. 尝试上传一张图片
3. 检查是否能正常显示

---

## 故障排查

### 查看详细日志

1. 进入 **Actions** 页面
2. 点击失败的 workflow 运行
3. 展开失败的步骤查看详细错误信息

### 常见错误

**错误 1：`403 Forbidden`**
- 原因：API Token 权限不足
- 解决：检查 Token 权限设置

**错误 2：`404 Not Found`**
- 原因：Account ID 或 Project Name 错误
- 解决：确认 Cloudflare 账号和项目信息

**错误 3：`npm ERR! missing script: build`**
- 原因：package.json 配置错误
- 解决：检查 package.json 中的 scripts

---

## 更多资源

- [Cloudflare Actions 文档](https://developers.cloudflare.com/pages/platform/build-configuration#using-github-actions)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [Cloudflare API Token 文档](https://developers.cloudflare.com/api/tokens/create/)

---

## 联系支持

如果遇到问题：

1. 查看 Cloudflare Pages 日志
2. 查看 GitHub Actions 日志
3. 检查 Secrets 配置是否正确
4. 参考 [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
