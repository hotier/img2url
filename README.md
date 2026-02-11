# img2url

图片转URL服务 - 基于Cloudflare R2

## 功能特性

- 支持多种图片格式上传
- 自动生成图片访问URL
- 基于Cloudflare R2对象存储
- 前后端分离架构
- 支持API文档查看

## 项目结构

```
img2url/
├── client/          # 前端应用 (React + Vite)
├── worker/          # Cloudflare Worker 后端
├── pages/           # Cloudflare Pages 配置
└── wrangler.toml    # Cloudflare 部署配置
```

## 部署指南

### 前置要求

1. 注册 [Cloudflare](https://dash.cloudflare.com/) 账号
2. 安装 Node.js (建议 v18+)
3. 安装 Wrangler CLI
   ```bash
   npm install -g wrangler
   ```

### 部署步骤

#### 1. 安装依赖

```bash
# 安装根目录依赖
npm install

# 安装客户端依赖
cd client
npm install
cd ..

# 安装 Worker 依赖
cd worker
npm install
cd ..
```

#### 2. 配置 Wrangler

登录 Cloudflare 账号：
```bash
wrangler login
```

创建 R2 存储桶（用于存储图片）：
```bash
wrangler r2 bucket create img2url-images
```

#### 3. 部署 Worker

部署 Cloudflare Worker：
```bash
npm run deploy:worker
```

#### 4. 部署前端

构建并部署前端到 Cloudflare Pages：
```bash
cd client
npm run build
```

然后手动将 `client/dist` 目录部署到 Cloudflare Pages，或使用以下命令：

```bash
cd client
npx wrangler pages deploy dist --project-name=img2url
```

### 环境变量配置

如需自定义配置，请修改以下文件：

- `wrangler.toml` - Worker 部署配置
- `wrangler.worker.toml` - Worker 独立配置
- `client/src/config.js` - 前端 API 配置

## 本地开发

### 启动开发环境

同时启动前端和后端开发服务器：

```bash
npm run dev
```

或分别启动：

```bash
# 启动 Worker 开发服务器
npm run dev:worker

# 启动前端开发服务器（新终端）
npm run dev:client
```

前端访问地址：http://localhost:5173

### 访问 API 文档

启动项目后，访问前端页面即可查看完整的 API 文档和使用说明。

## 使用方法

### 1. 上传图片

1. 打开应用页面
2. 点击或拖拽图片到上传区域
3. 等待上传完成
4. 复制生成的图片 URL

### 2. API 使用

#### 上传图片接口

```
POST /upload
Content-Type: multipart/form-data

参数：
- file: 图片文件
```

#### 获取图片列表接口

```
GET /images
```

#### 删除图片接口

```
DELETE /image/:id
```

## 技术栈

- **前端**: React 18, Vite, JSX
- **后端**: Cloudflare Worker (TypeScript)
- **存储**: Cloudflare R2
- **部署**: Cloudflare Workers & Pages

## 许可证

MIT