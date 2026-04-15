# 推送代码到 GitHub 并自动部署

## 概述

本文档指导如何将 Img2URL 项目推送到 GitHub，并通过 GitHub Actions 实现自动部署到 Cloudflare Pages。

## 准备工作

### 1. 已完成的配置

- ✅ GitHub Actions workflow 已创建 (`.github/workflows/deploy.yml`)
- ✅ 部署脚本已创建 (`deploy.bat`, `deploy.sh`)
- ✅ 部署文档已完成
- ✅ R2 存储桶已绑定

### 2. 需要配置的 Secrets

在 GitHub 仓库中添加以下 Secrets（详见 [GITHUB_ACTIONS_SECRETS.md](./GITHUB_ACTIONS_SECRETS.md)）：

| Secret 名称 | 值 | 说明 |
|-------------|-----|------|
| `CLOUDFLARE_API_TOKEN` | - | Cloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | - | Cloudflare Account ID |

---

## 步骤 1：初始化 Git 仓库

如果项目还没有初始化 Git 仓库：

```bash
cd /d/My_code/img2url

# 初始化 Git
git init

# 添加所有文件
git add .

# 提交
git commit -m "Initial commit: Img2URL with Cloudflare Pages setup"

# 推送到 GitHub（如果是第一次）
# 将 YOUR_GITHUB_USERNAME 替换为你的 GitHub 用户名
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/img2url.git
git push -u origin main
```

---

## 步骤 2：配置 GitHub Secrets

1. 访问 `https://github.com/YOUR_GITHUB_USERNAME/img2url/settings/secrets/actions`

2. 点击 **New repository secret**

3. 添加以下 Secrets：

   **CLOUDFLARE_API_TOKEN**
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: 从 Cloudflare Dashboard 获取的 API Token

   **CLOUDFLARE_ACCOUNT_ID**
   - Name: `CLOUDFLARE_ACCOUNT_ID`
   - Value: Cloudflare 账号的 Account ID

4. 保存后重复添加

**详细教程**：[GITHUB_ACTIONS_SECRETS.md](./GITHUB_ACTIONS_SECRETS.md)

---

## 步骤 3：推送代码触发自动部署

### 方法 1：推送所有更改

```bash
# 查看当前状态
git status

# 添加所有更改
git add .

# 提交
git commit -m "feat: Add GitHub Actions auto-deploy and fix upload issues"

# 推送到 GitHub
git push origin main
```

### 方法 2：推送到新分支测试

```bash
# 创建并推送新分支
git checkout -b feature/test
git push origin feature/test

# 在 Actions 页面手动触发部署
```

---

## 步骤 4：监控部署状态

### 查看 Actions 执行状态

1. 进入 GitHub 仓库首页
2. 点击 **Actions** 标签
3. 你会看到 **Deploy to Cloudflare Pages** workflow 正在运行

### 查看部署日志

1. 点击 **Deploy to Cloudflare Pages** workflow
2. 查看每个步骤的详细日志

**成功的标志**：
- ✅ Checkout code
- ✅ Setup Node.js
- ✅ Install dependencies
- ✅ Build frontend
- ✅ Deploy to Cloudflare Pages

---

## 步骤 5：验证部署

### 访问部署的站点

1. **前端页面**：`https://img2url.pages.dev` 或你的自定义域名
2. **测试上传**：
   - 访问前端页面
   - 尝试上传一张图片
   - 检查是否能正常显示

### 测试 API

```bash
# 健康检查
curl https://img2url.pages.dev/health

# 上传测试（创建 test.png）
curl -X POST https://img2url.pages.dev/upload \
  -F "file=@test.png"
```

---

## 常见问题

### 1. 推送后没有触发 Actions

**原因**：可能没有推送 main 分支，或文件没有触发 workflow

**解决**：
```bash
# 确认在 main 分支
git branch

# 推送到 main 分支
git push origin main
```

### 2. Actions 部署失败

**查看日志**：
1. 进入 Actions 页面
2. 点击失败的 workflow
3. 查看具体错误信息

**常见错误**：
- API Token 权限不足 → 检查 Token 权限
- Account ID 错误 → 确认 Account ID 正确
- 文件不存在 → 检查项目文件完整性

### 3. 部署成功但无法上传

**原因**：Cloudflare Pages 环境变量未配置

**解决**：
1. 登录 Cloudflare Dashboard
2. 进入 Workers & Pages > img2url > Settings > Environment variables
3. 添加运行时环境变量（详见 CF_PAGES_DEPLOY.md）

---

## 快速命令参考

### Git 常用命令

```bash
# 查看状态
git status

# 查看更改
git diff

# 添加文件
git add .
git add src/

# 提交
git commit -m "message"

# 推送
git push origin main

# 查看分支
git branch

# 切换分支
git checkout branch-name
```

### GitHub Actions 常用操作

```bash
# 查看所有 workflows
gh workflow list

# 查看特定 workflow
gh workflow view deploy.yml

# 手动触发 workflow
gh workflow run deploy.yml

# 查看最近的 runs
gh run list
```

---

## 部署流程图

```
推送代码到 GitHub
      ↓
GitHub Actions 触发
      ↓
Checkout 代码
      ↓
安装依赖
      ↓
构建前端
      ↓
部署到 Cloudflare Pages
      ↓
✅ 部署完成
```

---

## 下一步

### 1. 配置自定义域名

在 Cloudflare Pages 中设置自定义域名：
- 进入 Workers & Pages > img2url > Custom domains
- 添加你的域名
- 在 Cloudflare DNS 中配置 CNAME 记录

### 2. 配置环境变量

在 Cloudflare Pages 中配置运行时环境变量：
- `R2_BUCKET_NAME`
- `R2_S3_ACCESS_KEY_ID`
- `R2_S3_SECRET_ACCESS_KEY`
- `R2_S3_ENDPOINT`

### 3. 设置回滚策略

在 Actions 中配置：
- 保留最近 10 次部署
- 启用自动回滚

### 4. 监控和日志

- 定期查看 Actions 日志
- 设置部署通知（可选）

---

## 需要帮助？

- **GitHub Actions Secrets 配置**：[GITHUB_ACTIONS_SECRETS.md](./GITHUB_ACTIONS_SECRETS.md)
- **Cloudflare Pages 部署**：[CF_PAGES_DEPLOY.md](./CF_PAGES_DEPLOY.md)
- **快速开始**：[QUICKSTART.md](./QUICKSTART.md)
- **查看日志**：GitHub 仓库的 Actions 页面

---

## 总结

✅ 推送代码到 GitHub
✅ 配置 GitHub Secrets
✅ 自动触发 Cloudflare Pages 部署
✅ 验证部署结果

完成！🎉
