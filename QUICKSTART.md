# 🚀 Cloudflare Pages 部署快速指南

## 最快 5 分钟部署

### 1️⃣ 一键部署（推荐）

```bash
deploy.bat          # Windows
deploy.sh           # macOS/Linux
```

### 2️⃣ 手动部署

```bash
npm install
npm run build
wrangler pages deploy dist
```

### 3️⃣ 配置环境变量

登录 [Cloudflare Dashboard](https://dash.cloudflare.com)，进入你的 Pages 项目，设置以下环境变量：

| 变量名 | 值 |
|--------|-----|
| `R2_BUCKET_NAME` | `img2url-images` |
| `R2_S3_ACCESS_KEY_ID` | 从 Cloudflare R2 获取 |
| `R2_S3_SECRET_ACCESS_KEY` | 从 Cloudflare R2 获取 |
| `R2_S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |

### 4️⃣ 完成！

访问你的部署 URL，开始上传图片！

---

## 🔑 获取 R2 S3 API 凭证

1. 进入 [Cloudflare Dashboard > R2](https://dash.cloudflare.com/?to=/:account/r2)
2. 点击 **Manage R2 API Tokens**
3. 创建新 Token（需要以下权限）：
   - ✅ List Bucket Objects
   - ✅ Get Bucket Object
   - ✅ Put Bucket Object
   - ✅ Delete Bucket Object
4. 复制 **Access Key ID** 和 **Secret Access Key**
5. 在 **S3 Compatibility** 中找到你的 **Endpoint**

---

## 📁 项目结构

```
dist/                    # 部署到 Cloudflare Pages
├── assets/              # 静态资源
├── index.html           # 主页
├── functions/           # API 后端
│   ├── worker.js        # 上传、删除等 API
│   └── _worker.js       # 入口文件
└── ...
```

---

## 🌐 访问地址

- **前端**：`https://img2url.pages.dev` 或你的自定义域名
- **API**：`https://img2url.pages.dev/upload`、`/i/` 等

---

## ⚠️ 常见问题

### 405 错误

**原因**：请求方法不被允许

**解决**：
- 确保使用相对路径 `/upload`
- 检查 Functions 是否正确部署
- 查看 Cloudflare Pages 日志

### 500 错误

**原因**：服务器内部错误

**解决**：
- 检查环境变量是否正确配置
- 确认 R2 存储桶存在且有权限
- 查看 Cloudflare Pages 日志

### 无法上传

**解决**：
1. 检查环境变量是否设置
2. 确认 R2 存储桶存在
3. 查看浏览器控制台和 Cloudflare 日志

---

## 📚 更多文档

- [完整部署指南](./CF_PAGES_DEPLOY.md)
- [API 文档](./README.md#api文档)
- [本地开发](./README.md#本地开发)

---

## 🆘 需要帮助？

1. 查看 [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
2. 查看 [Cloudflare Functions 文档](https://developers.cloudflare.com/workers/)
3. 检查 Cloudflare Pages 的实时日志

---

## 💡 提示

- ✅ 使用 Cloudflare CDN，全球加速
- ✅ 免费使用 R2 存储桶（10GB）
- ✅ 自动 HTTPS
- ✅ 无需服务器维护
