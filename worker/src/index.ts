export interface Env {
  IMAGES: R2Bucket;
  IMG_EXPIRY: KVNamespace;
  CORS_ORIGIN?: string;
  CUSTOM_DOMAIN?: string;
  TURNSTILE_SECRET_KEY?: string;
}

// 格式化时间为东八区 yyyy-mm-dd hh:mm:ss
function formatTimestamp(): string {
  const now = new Date();
  // 转换为东八区时间（UTC+8）
  const offset = 8 * 60 * 60 * 1000; // 8小时的毫秒数
  const utc8Time = new Date(now.getTime() + offset);
  
  const year = utc8Time.getFullYear();
  const month = String(utc8Time.getMonth() + 1).padStart(2, '0');
  const day = String(utc8Time.getDate()).padStart(2, '0');
  const hours = String(utc8Time.getHours()).padStart(2, '0');
  const minutes = String(utc8Time.getMinutes()).padStart(2, '0');
  const seconds = String(utc8Time.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 处理 CORS
    if (request.method === 'OPTIONS') {
      return handleCORS(env.CORS_ORIGIN);
    }

    const url = new URL(request.url);

    // POST /upload - 上传图片
    if (url.pathname === '/upload' && request.method === 'POST') {
      return handleUpload(request, env);
    }

    // POST /cleanup - 清理过期图片（定时任务调用）
    if (url.pathname === '/cleanup' && request.method === 'POST') {
      return handleCleanup(env);
    }

    // GET /stats - 统计信息
    if (url.pathname === '/stats' && request.method === 'GET') {
      return handleStats(env);
    }

    // POST /sync-stats - 同步统计信息
    if (url.pathname === '/sync-stats' && request.method === 'POST') {
      return handleSyncStats(env);
    }

    // GET /api - API 文档
    if (url.pathname === '/api' && request.method === 'GET') {
      return handleApiDocs(env);
    }

    // GET /debug - 调试接口
    if (url.pathname === '/debug' && request.method === 'GET') {
      return handleDebug(env);
    }

    // GET /:code - 短链接访问图片
    if (url.pathname.match(/^\/[a-z0-9]{8}\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i) && request.method === 'GET') {
      return handleShortLink(url, env);
    }

    // GET /health - 健康检查
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },

  // 定时触发器
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Running scheduled cleanup task');
    try {
      await handleCleanup(env);
    } catch (error) {
      console.error('Scheduled cleanup failed:', error);
    }
  },
};

function handleCORS(corsOrigin: string = '*'): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const expiration = parseInt(formData.get('expiration') as string) || 0;
    const turnstileToken = formData.get('turnstile') as string;

    console.log('Upload request received:');
    console.log('  - File:', file ? `${file.name} (${file.size} bytes)` : 'null');
    console.log('  - Turnstile token:', turnstileToken ? `${turnstileToken.substring(0, 20)}...` : 'null');

    if (!file) {
      return errorResponse(400, 'MISSING_FILE', 'No file provided');
    }

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      return errorResponse(400, 'INVALID_FILE_TYPE', 'Only image files are allowed');
    }

    // 验证文件大小（最大10MB）
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return errorResponse(400, 'FILE_TOO_LARGE', 'File size exceeds 10MB limit');
    }

    // 计算文件哈希，检查是否重复上传
    const arrayBuffer = await file.arrayBuffer();
    const fileHash = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const fileHashHex = Array.from(new Uint8Array(fileHash)).map(b => b.toString(16).padStart(2, '0')).join('');
    const hashKey = `hash:${fileHashHex}`;

    const existingFile = await env.IMG_EXPIRY.get(hashKey);
    if (existingFile) {
      const existingData = JSON.parse(existingFile);
      // 更新上传时间戳
      const newTimestamp = formatTimestamp();
      await env.IMG_EXPIRY.put(hashKey, JSON.stringify({
        ...existingData,
        lastUploadTime: newTimestamp,
        uploadCount: (existingData.uploadCount || 1) + 1,
      }), {
        expirationTtl: 30 * 24 * 60 * 60
      });

      return corsResponse(
        '*',
        JSON.stringify({
          success: true,
          code: 200,
          data: {
            url: existingData.url,
            fileName: existingData.fileName,
            size: file.size,
            type: file.type,
            timestamp: newTimestamp,
            originalTimestamp: existingData.timestamp,
            duplicate: true,
            uploadCount: (existingData.uploadCount || 1) + 1,
          },
        }),
        'application/json'
      );
    }

    // 获取客户端 IP
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const userAgent = request.headers.get('User-Agent') || 'unknown';
    
    // 检查今日上传次数限制（每IP最多500次）
    const todayKey = `uploads:${new Date().toISOString().split('T')[0]}`;
    const ipKey = `${todayKey}:${clientIP}`;
    
    const currentUploads = await env.IMG_EXPIRY.get(ipKey);
    const uploadCount = currentUploads ? parseInt(currentUploads) : 0;
    
    // 每 50 次上传需要人机验证（从第 301 次开始）
    const needsCaptcha = uploadCount >= 300 && (uploadCount % 50) === 0;
    
    // 如果需要验证但没有提供 token，拒绝
    if (needsCaptcha && !turnstileToken) {
      return errorResponse(403, 'CAPTCHA_REQUIRED', 'Captcha verification required for high-volume uploads');
    }
    
    // 如果提供了 Turnstile token，必须验证
    if (turnstileToken) {
      const turnstileSecret = env.TURNSTILE_SECRET_KEY || '';
      console.log('Turnstile Secret Key:', turnstileSecret ? 'exists' : 'missing');
      if (!turnstileSecret) {
        return errorResponse(500, 'CONFIG_ERROR', 'Turnstile not configured');
      }

      // 检查 token 是否已被使用（防止重复使用）
      // 使用哈希缩短键名，避免超过 KV 键长度限制（512 字节）
      const tokenHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(turnstileToken));
      const tokenHashHex = Array.from(new Uint8Array(tokenHash)).map(b => b.toString(16).padStart(2, '0')).join('');
      const tokenUsedKey = `ts:${tokenHashHex}`;
      const tokenUsed = await env.IMG_EXPIRY.get(tokenUsedKey);
      if (tokenUsed) {
        return errorResponse(403, 'CAPTCHA_USED', 'This verification token has already been used');
      }

      // 验证 Turnstile token
      const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: turnstileSecret,
          response: turnstileToken,
          remote_ip: clientIP,
        }),
      });

      const verifyResult = await verifyResponse.json();
      console.log('Turnstile verify result:', JSON.stringify(verifyResult));
      if (!verifyResult.success) {
        return errorResponse(403, 'CAPTCHA_FAILED', `Captcha verification failed: ${verifyResult['error-codes']?.join(', ') || 'Unknown error'}`);
      }

      // 标记 token 已使用（有效期 5 分钟）
      await env.IMG_EXPIRY.put(tokenUsedKey, '1', {
        expirationTtl: 300
      });
    }
    
    // 检查是否超过每日上限
    if (uploadCount >= 500) {
      return errorResponse(429, 'RATE_LIMIT_EXCEEDED', 'Daily upload limit exceeded (500 uploads per IP)');
    }
    
    // 更新上传计数
    await env.IMG_EXPIRY.put(ipKey, String(uploadCount + 1), {
      expirationTtl: 24 * 60 * 60
    });

    // 检查存储空间使用情况
    const statsData = await env.IMG_EXPIRY.get('global:stats');
    if (statsData) {
      try {
        const parsed = JSON.parse(statsData);
        const currentSize = parsed.totalSize || 0;
        const STORAGE_LIMIT = 10 * 1024 * 1024 * 1024; // 10GB
        
        // 如果存储空间使用超过 95%，拒绝上传
        if (currentSize >= STORAGE_LIMIT * 0.95) {
          return errorResponse(507, 'STORAGE_FULL', 'Storage space is nearly full, please try again later');
        }
      } catch (e) {
        console.error('Error checking storage:', e);
      }
    }

    // 检查异常行为（短时间内大量上传）
    const rateKey = `upload_rate:${clientIP}:${Math.floor(Date.now() / 60000)}`; // 每分钟
    const currentRate = await env.IMG_EXPIRY.get(rateKey);
    const rateCount = currentRate ? parseInt(currentRate) : 0;
    
    if (rateCount >= 30) { // 每分钟最多 30 次
      return errorResponse(429, 'RATE_LIMIT_EXCEEDED', 'Too many uploads in a short time, please slow down');
    }
    
    await env.IMG_EXPIRY.put(rateKey, String(rateCount + 1), {
      expirationTtl: 60
    });

    // 生成短文件名（8位随机字符），统一使用 .webp 扩展名
    const shortCode = Math.random().toString(36).substring(2, 10);
    const fileName = `${shortCode}.webp`;

    // 图片压缩优化 - 强制转换为 WebP 格式
    let compressedArrayBuffer = arrayBuffer;
    let compressedType = 'image/webp';

    // 如果是 JPEG/PNG/WebP/GIF，进行压缩并转换为 WebP
    if (file.type.startsWith('image/')) {
      try {
        // 使用 Canvas API 压缩图片
        const imageBitmap = await createImageBitmap(new Blob([arrayBuffer], { type: file.type }));
        const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.drawImage(imageBitmap, 0, 0);

          // 计算压缩质量（根据文件大小）
          let quality = 0.85;
          if (file.size > 2 * 1024 * 1024) {
            quality = 0.75; // 大文件压缩更多
          } else if (file.size > 1 * 1024 * 1024) {
            quality = 0.80; // 中等文件
          }

          // 转换为 WebP 格式以获得更好的压缩
          const compressedBlob = await canvas.convertToBlob({
            quality: quality,
            type: 'image/webp' // 强制转换为 WebP
          });

          // 使用压缩后的 WebP 版本
          compressedArrayBuffer = await compressedBlob.arrayBuffer();
          compressedType = 'image/webp';
          console.log(`Image converted to WebP: ${file.size} -> ${compressedBlob.size} bytes (${Math.round((1 - compressedBlob.size / file.size) * 100)}% reduction)`);
        }

        imageBitmap.close();
      } catch (e) {
        console.error('Image compression failed:', e);
        // 压缩失败，使用原始文件（但仍然标记为 webp）
        compressedType = 'image/webp';
      }
    }

    // 上传到 R2（使用压缩后的数据）
    await env.IMAGES.put(fileName, compressedArrayBuffer, {
      httpMetadata: {
        contentType: compressedType,
      },
    });

    // 使用自定义域名生成短链接
    const customDomain = env.CUSTOM_DOMAIN || 'https://api.hotier.cc.cd';
    const imageUrl = `${customDomain}/${fileName}`;

    // 记录到 KV 并更新统计
    await env.IMG_EXPIRY.put(fileName, JSON.stringify({
      expiryTime: expiration > 0 ? Date.now() + expiration * 24 * 60 * 60 * 1000 : null,
      expiration: expiration,
      uploadTime: Date.now(),
      size: file.size,
      uploaderIP: clientIP,
      userAgent: userAgent,
    }), {
      expirationTtl: expiration > 0 ? expiration * 24 * 60 * 60 : 365 * 24 * 60 * 60
    });

    // 保存文件哈希映射（防止重复上传），有效期30天
    await env.IMG_EXPIRY.put(hashKey, JSON.stringify({
      url: imageUrl,
      fileName,
      timestamp: formatTimestamp(),
      uploadCount: 1,
    }), {
      expirationTtl: 30 * 24 * 60 * 60
    });

    // 更新统计
    await updateStats(env, file.size, 1);

    // 清除统计缓存，确保下次获取最新统计
    await env.IMG_EXPIRY.delete('stats:cache');

    return corsResponse(
      '*',
      JSON.stringify({
        success: true,
        code: 200,
        data: {
          url: imageUrl,
          fileName,
          size: file.size,
          type: file.type,
          timestamp: formatTimestamp(),          expiration: expiration > 0 ? new Date(Date.now() + expiration * 24 * 60 * 60 * 1000).getTime() : null,
          expirationDays: expiration > 0 ? expiration : null,
          remainingUploads: 500 - (uploadCount + 1),
          captchaRequired: (uploadCount + 1) >= 300 && ((uploadCount + 1) % 50) === 0,
        },
      }),
      'application/json'
    );
  } catch (error) {
    console.error('Upload error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    return errorResponse(500, 'UPLOAD_FAILED', `Upload failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function handleSyncStats(env: Env): Promise<Response> {
  try {
    // 从 R2 遍历获取实际统计
    let totalSize = 0;
    let count = 0;
    let cursor = undefined;
    const maxIterations = 10000;
    let iterations = 0;
    
    // 第一次调用
    const firstList = await env.IMAGES.list({ limit: 1000 });
    
    if (firstList.keys && firstList.keys.length > 0) {
      for (const key of firstList.keys) {
        totalSize += key.size || 0;
        count++;
      }
    }
    
    // 继续分页
    if (firstList.truncated && firstList.cursor) {
      cursor = firstList.cursor;
      
      while (iterations < maxIterations) {
        iterations++;
        const list = await env.IMAGES.list({ limit: 1000, cursor: cursor });
        
        if (list.keys && list.keys.length > 0) {
          for (const key of list.keys) {
            totalSize += key.size || 0;
            count++;
          }
        }
        
        if (!list.truncated || (list.keys && list.keys.length === 0)) {
          break;
        }
        
        cursor = list.cursor;
      }
    }

    // 更新 KV 中的统计信息
    await env.IMG_EXPIRY.put('global:stats', JSON.stringify({
      totalSize,
      count,
      lastUpdate: Date.now(),
    }), {
      expirationTtl: 365 * 24 * 60 * 60
    });

    return corsResponse(
      '*',
      JSON.stringify({
        success: true,
        code: 200,
        data: {
          syncedImages: count,
          syncedSize: totalSize,
          syncedSizeFormatted: formatSize(totalSize),
          message: '统计信息已同步',
        },
      }),
      'application/json'
    );
  } catch (error) {
    console.error('Sync stats error:', error);
    return errorResponse(500, 'SYNC_FAILED', '同步失败');
  }
}

async function handleStats(env: Env): Promise<Response> {
  try {
    // Cloudflare R2 免费额度
    const STORAGE_LIMIT = 10 * 1024 * 1024 * 1024; // 10GB
    const READ_LIMIT = 1000000; // 每天100万次读取

    // 从 KV 获取缓存的统计信息
    const cachedStats = await env.IMG_EXPIRY.get('stats:cache');
    const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存
    
    if (cachedStats) {
      const parsed = JSON.parse(cachedStats);
      // 如果缓存未过期，直接返回
      if (Date.now() - parsed.lastUpdate < CACHE_DURATION) {
        return corsResponse(
          '*',
          JSON.stringify({
            success: true,
            data: parsed.data,
            cached: true,
          }),
          'application/json'
        );
      }
    }

    // 从 KV 获取增量统计
    const statsKey = 'global:stats';
    const statsData = await env.IMG_EXPIRY.get(statsKey);
    
    let kvTotalSize = 0;
    let kvCount = 0;
    
    if (statsData) {
      try {
        const parsed = JSON.parse(statsData);
        kvTotalSize = parsed.totalSize || 0;
        kvCount = parsed.count || 0;
      } catch (e) {
        console.error('Error parsing stats:', e);
      }
    }

    // 从 R2 遍历获取实际统计
    let r2TotalSize = 0;
    let r2Count = 0;
    
    try {
      const firstList = await env.IMAGES.list({ limit: 1000 });
      
      if (firstList.keys && firstList.keys.length > 0) {
        for (const key of firstList.keys) {
          r2TotalSize += key.size || 0;
          r2Count++;
        }
      }
      
      // 继续分页（最多迭代 100 次，防止无限循环和超时）
      if (firstList.truncated && firstList.cursor) {
        let cursor = firstList.cursor;
        const maxIterations = 100;
        let iterations = 0;
        
        while (iterations < maxIterations) {
          iterations++;
          const list = await env.IMAGES.list({ limit: 1000, cursor: cursor });
          
          if (list.keys && list.keys.length > 0) {
            for (const key of list.keys) {
              r2TotalSize += key.size || 0;
              r2Count++;
            }
          }
          
          if (!list.truncated || (list.keys && list.keys.length === 0)) {
            break;
          }
          
          cursor = list.cursor;
        }
      }
    } catch (e) {
      console.error('Error listing R2:', e);
    }

    // 取两者中的较大值
    const finalCount = Math.max(kvCount, r2Count);
    const finalTotalSize = Math.max(kvTotalSize, r2TotalSize);

    // 从 KV 获取今日读取次数
    const todayKey = `stats:${new Date().toISOString().split('T')[0]}`;
    const todayReads = await env.IMG_EXPIRY.get(todayKey);
    const readCount = todayReads ? parseInt(todayReads) : 0;

    const statsDataResponse = {
      images: finalCount,
      totalSize: finalTotalSize,
      totalSizeFormatted: formatSize(finalTotalSize),
      storageUsage: (finalTotalSize / STORAGE_LIMIT) * 100,
      readCount: readCount,
      readLimit: READ_LIMIT,
      readUsage: (readCount / READ_LIMIT) * 100,
      limits: {
        storage: formatSize(STORAGE_LIMIT),
        read: READ_LIMIT,
      },
      warnings: getWarnings(finalTotalSize, STORAGE_LIMIT, readCount, READ_LIMIT),
    };

    // 缓存统计信息
    await env.IMG_EXPIRY.put('stats:cache', JSON.stringify({
      data: statsDataResponse,
      lastUpdate: Date.now(),
    }), {
      expirationTtl: CACHE_DURATION / 1000
    });

    return corsResponse(
      '*',
      JSON.stringify({
        success: true,
        data: statsDataResponse,
        cached: false,
      }),
      'application/json'
    );
  } catch (error) {
    console.error('Stats error:', error);
    return corsResponse(
      '*',
      JSON.stringify({
        success: true,
        data: {
          images: 0,
          totalSize: 0,
          totalSizeFormatted: '0 B',
          storageUsage: 0,
          readCount: 0,
          readLimit: 1000000,
          readUsage: 0,
          limits: {
            storage: '10 GB',
            read: 1000000,
          },
          warnings: [],
        },
      }),
      'application/json'
    );
  }
}

function getWarnings(totalSize: number, storageLimit: number, readCount: number, readLimit: number): string[] {
  const warnings: string[] = [];
  const storagePercent = (totalSize / storageLimit) * 100;
  const readPercent = (readCount / readLimit) * 100;

  if (storagePercent >= 90) {
    warnings.push('存储空间使用超过90%，请注意清理图片！');
  } else if (storagePercent >= 70) {
    warnings.push('存储空间使用超过70%，建议开始清理旧图片。');
  }

  if (readPercent >= 90) {
    warnings.push('今日读取次数接近上限！');
  } else if (readPercent >= 70) {
    warnings.push('今日读取次数较多，请注意使用。');
  }

  return warnings;
}

async function handleCleanup(env: Env): Promise<Response> {
  try {
    const list = await env.IMAGES.list();
    let deletedCount = 0;

    for (const key of list.keys) {
      try {
        const value = await env.IMG_EXPIRY.get(key.name);
        if (value) {
          const data = JSON.parse(value);
          const now = Date.now();
          
          if (data.expiryTime && now > data.expiryTime) {
            await env.IMAGES.delete(key.name);
            await env.IMG_EXPIRY.delete(key.name);
            deletedCount++;
          }
        }
      } catch (e) {
        console.error(`Error processing key ${key.name}:`, e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      code: 200,
      data: { deletedCount },
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return errorResponse(500, 'CLEANUP_FAILED', 'Cleanup failed');
  }
}

async function handleDebug(env: Env): Promise<Response> {
  try {
    const list = await env.IMAGES.list({ limit: 10 });
    
    return corsResponse(
      '*',
      JSON.stringify({
        bindingName: 'IMAGES',
        truncated: list.truncated,
        cursor: list.cursor,
        keysCount: list.keys ? list.keys.length : 0,
        keys: list.keys ? list.keys.map(k => ({
          name: k.name,
          size: k.size,
          uploaded: k.uploaded
        })) : []
      }),
      'application/json'
    );
  } catch (error) {
    return corsResponse(
      '*',
      JSON.stringify({
        error: error.message,
        stack: error.stack
      }),
      'application/json'
    );
  }
}

async function updateStats(env: Env, sizeDelta: number, countDelta: number): Promise<void> {
  try {
    const statsKey = 'global:stats';
    const statsData = await env.IMG_EXPIRY.get(statsKey);
    
    let totalSize = 0;
    let count = 0;
    
    if (statsData) {
      try {
        const parsed = JSON.parse(statsData);
        totalSize = parsed.totalSize || 0;
        count = parsed.count || 0;
      } catch (e) {
        console.error('Error parsing stats:', e);
      }
    }
    
    totalSize += sizeDelta;
    count += countDelta;
    
    await env.IMG_EXPIRY.put(statsKey, JSON.stringify({
      totalSize,
      count,
      lastUpdate: Date.now(),
    }), {
      expirationTtl: 365 * 24 * 60 * 60
    });
  } catch (e) {
    console.error('Error updating stats:', e);
  }
}

async function handleApiDocs(env: Env): Promise<Response> {
  const customDomain = env.CUSTOM_DOMAIN || 'https://api.hotier.cc.cd';

  const docs = {
    name: 'Img2URL API',
    version: '1.0.0',
    description: '基于 Cloudflare R2 的免费图片托管服务 API',
    baseUrl: customDomain,
    endpoints: [
      {
        method: 'POST',
        path: '/upload',
        description: '上传图片并获取 URL',
        parameters: [
          {
            name: 'Content-Type',
            type: 'String',
            required: true,
            description: '请求内容类型，必须设置为 multipart/form-data',
          },
          {
            name: 'file',
            type: 'File',
            required: true,
            description: '图片文件（最大10MB）',
          },
          {
            name: 'expiration',
            type: 'Number',
            required: false,
            description: '有效期天数（可选，0=永久）',
          },
        ],
        response: {
          success: {
            code: 200,
            message: '上传成功',
            data: {
              url: `${customDomain}/abc12345.jpg`,
              fileName: 'abc12345.jpg',
              size: 123456,
              type: 'image/jpeg',
              timestamp: 1234567890000,
              expiration: null,
              expirationDays: null,
            },
          },
          errors: [
            {
              code: 400,
              error: 'MISSING_FILE',
              message: '未提供文件',
            },
            {
              code: 400,
              error: 'INVALID_FILE_TYPE',
              message: '只允许上传图片文件',
            },
            {
              code: 400,
              error: 'FILE_TOO_LARGE',
              message: '文件大小超过10MB限制',
            },
            {
              code: 500,
              error: 'UPLOAD_FAILED',
              message: '上传失败',
            },
          ],
        },
      },
      {
        method: 'GET',
        path: '/stats',
        description: '获取存储统计信息',
        response: {
          success: {
            code: 200,
            data: {
              images: 100,
              totalSize: 1234567890,
              totalSizeFormatted: '1.15 GB',
              storageUsage: 11.5,
              readCount: 50000,
              readLimit: 1000000,
              readUsage: 5,
              limits: {
                storage: '10 GB',
                read: 1000000,
              },
              warnings: [],
            },
          },
        },
      },
    ],
    examples: {
      curl: `# 上传图片（永久保存）
curl -X POST ${customDomain}/upload \\
  -F "file=@image.jpg"

# 上传图片（30天有效期）
curl -X POST ${customDomain}/upload \\
  -F "file=@image.jpg" \\
  -F "expiration=30"`,

      javascript: `// 上传图片
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('expiration', '30'); // 可选

fetch('${customDomain}/upload', {
  method: 'POST',
  body: formData,
})
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      console.log('图片URL:', data.data.url);
    }
  });`,

      python: `import requests

# 上传图片
files = {'file': open('image.jpg', 'rb')}
data = {'expiration': '30'}  # 可选

response = requests.post(
  '${customDomain}/upload',
  files=files,
  data=data
)

result = response.json()
if result['success']:
  print('图片URL:', result['data']['url'])`,

      php: `<?php
// 上传图片
$ch = curl_init('${customDomain}/upload');
$cfile = new CURLFile('image.jpg');
$data = [
  'file' => $cfile,
  'expiration' => '30'  // 可选
];

curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$response = curl_exec($ch);
curl_close($ch);

$result = json_decode($response, true);
if ($result['success']) {
  echo '图片URL: ' . $result['data']['url'] . PHP_EOL;
}
?>`,
    },
  };

  return corsResponse(
    '*',
    JSON.stringify(docs),
    'application/json'
  );
}

async function handleShortLink(url: URL, env: Env): Promise<Response> {
  const fileName = url.pathname.substring(1);
  const clientIP = url.searchParams.get('ip') || 'unknown';
  
  try {
    // 检查今日读取次数限制
    const todayKey = `stats:${new Date().toISOString().split('T')[0]}`;
    const currentReads = await env.IMG_EXPIRY.get(todayKey);
    const readCount = currentReads ? parseInt(currentReads) : 0;
    const READ_LIMIT = 1000000; // 每天100万次读取
    
    // 如果读取次数超过 95%，返回警告
    if (readCount >= READ_LIMIT * 0.95) {
      console.warn(`Read limit nearly reached: ${readCount}/${READ_LIMIT}`);
    }
    
    // 检查单个 IP 的访问频率限制（每分钟最多 100 次）
    const ipRateKey = `rate:${clientIP}:${Math.floor(Date.now() / 60000)}`;
    const ipRateCount = await env.IMG_EXPIRY.get(ipRateKey);
    const currentIpRate = ipRateCount ? parseInt(ipRateCount) : 0;
    
    if (currentIpRate >= 100) {
      return new Response('Rate limit exceeded', { status: 429 });
    }
    
    // 更新 IP 访问频率
    await env.IMG_EXPIRY.put(ipRateKey, String(currentIpRate + 1), {
      expirationTtl: 60
    });

    const object = await env.IMAGES.get(fileName);
    
    if (!object) {
      return new Response('Image not found', { status: 404 });
    }

    // 检查是否过期
    const expiryData = await env.IMG_EXPIRY.get(fileName);
    if (expiryData) {
      const data = JSON.parse(expiryData);
      if (data.expiryTime && Date.now() > data.expiryTime) {
        await env.IMAGES.delete(fileName);
        await env.IMG_EXPIRY.delete(fileName);
        return new Response('Image has expired', { status: 410 });
      }
    }

    // 记录读取次数
    await env.IMG_EXPIRY.put(todayKey, String(readCount + 1), {
      expirationTtl: 2 * 24 * 60 * 60
    });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000');

    return new Response(object.body, { headers });
  } catch (error) {
    console.error('Short link error:', error);
    return new Response('Failed to retrieve image', { status: 500 });
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function errorResponse(code: number, error: string, message: string): Response {
  return new Response(
    JSON.stringify({ success: false, code, error, message }),
    {
      status: code,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    }
  );
}

function corsResponse(
  corsOrigin: string = '*',
  body: string,
  contentType: string = 'application/json'
): Response {
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}