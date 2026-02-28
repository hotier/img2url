// API 配置
// ⚠️ 重要：修改此处的URL会影响整个应用的API调用
// 
// 生产环境示例：
// export const API_URL = 'https://api.yourdomain.com';
// 
// 开发环境示例：
// export const API_URL = 'http://localhost:8787';
//
// 当前配置：
export const API_URL = 'https://api.hotier.cc.cd';
export const API_DOMAIN = 'https://api.hotier.cc.cd';

// 可选：通过环境变量覆盖配置（用于本地开发）
const envApiUrl = import.meta.env.VITE_API_URL;
if (envApiUrl) {
  console.log('Using API URL from environment variable:', envApiUrl);
}