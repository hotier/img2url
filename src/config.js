// API 配置
// ⚠️ 重要：修改此处的URL会影响整个应用的API调用
// 
// 生产环境（Pages Functions）：
export const API_URL = '';
export const API_DOMAIN = '';

// 开发环境示例：
// export const API_URL = 'http://localhost:8787';
// export const API_DOMAIN = 'http://localhost:8787';

// 可选：通过环境变量覆盖配置（用于本地开发）
const envApiUrl = import.meta.env.VITE_API_URL;
if (envApiUrl) {
  console.log('Using API URL from environment variable:', envApiUrl);
}