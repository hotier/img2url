// 常量定义
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const CONSTANTS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_IMAGE_WIDTH: 10000,
  MAX_IMAGE_HEIGHT: 10000,
  MAX_UPLOADS_PER_DAY: 500,
  MAX_UPLOADS_PER_MINUTE: 30,
  MAX_READS_PER_MINUTE: 100,
  CAPTCHA_UPLOAD_THRESHOLD: 300,
  CAPTCHA_UPLOAD_INTERVAL: 50,
  TURNSTILE_TOKEN_EXPIRY: 900, // 15分钟
  STORAGE_LIMIT: 10 * 1024 * 1024 * 1024, // 10GB
  READ_LIMIT: 1000000, // 每天100万次读取
  STORAGE_WARNING_THRESHOLD: 0.95, // 95%
  READ_WARNING_THRESHOLD: 0.95, // 95%
  STORAGE_NOTIFY_THRESHOLD: 0.70, // 70%
  READ_NOTIFY_THRESHOLD: 0.70, // 70%
} as const;

export interface Env {
  IMAGES: R2Bucket;
  IMG_EXPIRY: KVNamespace;
  CORS_ORIGIN?: string;
  CUSTOM_DOMAIN?: string;
  TURNSTILE_SECRET_KEY?: string;
  R2_S3_ACCESS_KEY_ID?: string;
  R2_S3_SECRET_ACCESS_KEY?: string;
  R2_S3_ENDPOINT?: string;
  R2_BUCKET_NAME?: string;
}

// 格式化时间为东八区 yyyy-mm-dd hh:mm:ss
function formatTimestamp(): string {
  const now = new Date();
  // 使用Intl API正确处理时区
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai'
  });
  
  return formatter.format(now).replace(/\//g, '-');
}

// 生成安全的短文件名（8位）
async function generateSecureFileName(): Promise<string> {
  const randomBytes = new Uint8Array(4);
  crypto.getRandomValues(randomBytes);
  const hex = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.substring(0, 8); // 取8个字符
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
    const maxSize = CONSTANTS.MAX_FILE_SIZE;
    if (file.size > maxSize) {
      return errorResponse(400, 'FILE_TOO_LARGE', `File size exceeds ${maxSize / 1024 / 1024}MB limit`);
    }

    // 计算文件哈希，检查是否重复上传
    const arrayBuffer = await file.arrayBuffer();

    // 验证图片尺寸（在压缩前检查）
    try {
      const imageBitmap = await createImageBitmap(new Blob([arrayBuffer], { type: file.type }));
      if (imageBitmap.width > CONSTANTS.MAX_IMAGE_WIDTH || imageBitmap.height > CONSTANTS.MAX_IMAGE_HEIGHT) {
        imageBitmap.close();
        return errorResponse(400, 'IMAGE_TOO_LARGE', `Image dimensions exceed ${CONSTANTS.MAX_IMAGE_WIDTH}x${CONSTANTS.MAX_IMAGE_HEIGHT} limit`);
      }
      imageBitmap.close();
    } catch (e) {
      // 如果无法创建ImageBitmap，可能在压缩时失败，继续处理
      console.warn('Unable to validate image dimensions:', e);
    }
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
    
    // 检查今日上传次数限制
    const todayKey = `uploads:${new Date().toISOString().split('T')[0]}`;
    const ipKey = `${todayKey}:${clientIP}`;
    
    const currentUploads = await env.IMG_EXPIRY.get(ipKey);
    const uploadCount = currentUploads ? parseInt(currentUploads) : 0;
    
    // 每N次上传需要人机验证
    const needsCaptcha = uploadCount >= CONSTANTS.CAPTCHA_UPLOAD_THRESHOLD && 
                          (uploadCount % CONSTANTS.CAPTCHA_UPLOAD_INTERVAL) === 0;
    
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

      // 标记 token 已使用（有效期由CONSTANTS定义）
      await env.IMG_EXPIRY.put(tokenUsedKey, '1', {
        expirationTtl: CONSTANTS.TURNSTILE_TOKEN_EXPIRY
      });
    }
    
    // 检查是否超过每日上限
    if (uploadCount >= CONSTANTS.MAX_UPLOADS_PER_DAY) {
      return errorResponse(429, 'RATE_LIMIT_EXCEEDED', `Daily upload limit exceeded (${CONSTANTS.MAX_UPLOADS_PER_DAY} uploads per IP)`);
    }
    
    // 更新上传计数
    await env.IMG_EXPIRY.put(ipKey, String(uploadCount + 1), {
      expirationTtl: 24 * 60 * 60
    });

    // 检查存储空间使用情况（获取最新统计）
    let currentStoragePercent = 0;
    try {
      const statsResponse = await handleStats(env);
      const statsText = await statsResponse.text();
      const statsData = JSON.parse(statsText);

      if (statsData.success && statsData.data) {
        currentStoragePercent = statsData.data.storageUsage || 0;

        // 90% 强制停止上传
        if (currentStoragePercent >= 90) {
          return errorResponse(507, 'STORAGE_FULL', `存储空间已使用 ${currentStoragePercent.toFixed(1)}%，已达到 90% 上限，暂停上传服务。请联系管理员清理旧图片。`);
        }

        // 70% 警告（但不阻止上传）
        if (currentStoragePercent >= 70) {
          console.warn(`Storage usage warning: ${currentStoragePercent.toFixed(1)}%`);
        }
      }
    } catch (e) {
      console.error('Error checking storage usage:', e);
    }

    // 检查异常行为（短时间内大量上传）
    const rateKey = `upload_rate:${clientIP}:${Math.floor(Date.now() / 60000)}`; // 每分钟
    const currentRate = await env.IMG_EXPIRY.get(rateKey);
    const rateCount = currentRate ? parseInt(currentRate) : 0;
    
    if (rateCount >= CONSTANTS.MAX_UPLOADS_PER_MINUTE) {
      return errorResponse(429, 'RATE_LIMIT_EXCEEDED', `Too many uploads in a short time, please slow down (max ${CONSTANTS.MAX_UPLOADS_PER_MINUTE} per minute)`);
    }
    
    await env.IMG_EXPIRY.put(rateKey, String(rateCount + 1), {
      expirationTtl: 60
    });

    // 生成安全的短文件名
    const shortCode = await generateSecureFileName();
    
    // 确定文件扩展名（GIF保持原格式，其他转为WebP）
    const isGif = file.type === 'image/gif';
    const fileName = `${shortCode}${isGif ? '.gif' : '.webp'}`;

    // 图片压缩优化 - GIF保持原格式，其他转换为WebP
    let compressedArrayBuffer = arrayBuffer;
    let compressedType = isGif ? 'image/gif' : 'image/webp';

    // 如果不是GIF，尝试压缩并转换为WebP
    if (!isGif && file.type.startsWith('image/')) {
      try {
        // 检查是否支持OffscreenCanvas
        if (typeof OffscreenCanvas !== 'undefined') {
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
              type: 'image/webp'
            });

            // 使用压缩后的 WebP 版本
            compressedArrayBuffer = await compressedBlob.arrayBuffer();
            compressedType = 'image/webp';
            console.log(`Image converted to WebP: ${file.size} -> ${compressedBlob.size} bytes (${Math.round((1 - compressedBlob.size / file.size) * 100)}% reduction)`);
          }

          imageBitmap.close();
        } else {
          console.warn('OffscreenCanvas not supported, using original file');
          // 降级：使用原始文件
          compressedType = file.type;
        }
      } catch (e) {
        console.error('Image compression failed:', e);
        // 压缩失败，使用原始文件
        compressedType = file.type;
      }
    } else if (isGif) {
      console.log('GIF file detected, preserving original format');
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

    // 标记缓存需要更新，下次访问stats时会重新查询R2 API
    await env.IMG_EXPIRY.put('stats:dirty', '1');

    // 计算过期时间（UTC+8 格式）
    let expirationTime: string | null = null;
    if (expiration > 0) {
      const expDate = new Date(Date.now() + expiration * 24 * 60 * 60 * 1000);
      const formatter = new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Shanghai'
      });
      expirationTime = formatter.format(expDate).replace(/\//g, '-');
    }

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
          timestamp: formatTimestamp(),
          expirationTime,
          expirationDays: expiration > 0 ? expiration : null,
          remainingUploads: 500 - (uploadCount + 1),
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
    let totalSize = 0;
    let count = 0;

    // 使用 Cloudflare R2 API 获取存储桶统计信息
    try {
      const accountId = 'adfb53e387c2b0452c567e03bfd35d9d';
      const apiToken = 'jsO13YbRTDfHrPECZqH_ukaUBTWRy3fS8k1HEhAS';
      const bucketName = 'img2url-images';

      let cursor: string | undefined = undefined;
      const maxIterations = 100;
      let iterations = 0;

      // 分页获取所有对象
      while (iterations < maxIterations) {
        iterations++;

        const url = cursor
          ? `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects?cursor=${encodeURIComponent(cursor)}`
          : `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects`;

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();

          if (data.success && data.result && Array.isArray(data.result)) {
            // 统计当前页的对象
            for (const obj of data.result) {
              count++;
              totalSize += obj.size || 0;
            }

            console.log(`Sync API iteration ${iterations}: ${data.result.length} objects, total: ${count}, size: ${totalSize} bytes`);

            // 检查是否还有更多数据
            if (data.result_info && data.result_info.is_truncated && data.result_info.cursor) {
              cursor = data.result_info.cursor;
            } else {
              // 没有更多数据了
              break;
            }
          } else {
            console.error('Invalid API response format');
            break;
          }
        } else {
          console.error('Cloudflare API sync error:', response.status, response.statusText);
          break;
        }
      }

      console.log(`Sync R2 bucket stats from API: ${count} objects, ${totalSize} bytes (${formatSize(totalSize)})`);
    } catch (e) {
      console.error('Error calling Cloudflare API for sync:', e);
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
    // 使用常量定义的限制
    const STORAGE_LIMIT = CONSTANTS.STORAGE_LIMIT;
    const READ_LIMIT = CONSTANTS.READ_LIMIT;

    // 检查是否有上传操作触发的更新标记
    const isDirty = await env.IMG_EXPIRY.get('stats:dirty');
    
    // 从 KV 获取缓存的统计信息
    const cachedStats = await env.IMG_EXPIRY.get('stats:cache');
    
    // 如果缓存存在且没有被标记为需要更新，直接返回缓存
    if (cachedStats && !isDirty) {
      const parsed = JSON.parse(cachedStats);
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

    // 使用 Cloudflare R2 API 获取存储桶统计信息
    let finalCount = 0;
    let finalTotalSize = 0;

    try {
      const accountId = 'adfb53e387c2b0452c567e03bfd35d9d';
      const apiToken = 'jsO13YbRTDfHrPECZqH_ukaUBTWRy3fS8k1HEhAS';
      const bucketName = 'img2url-images';

      let cursor: string | undefined = undefined;
      const maxIterations = 100;
      let iterations = 0;

      // 分页获取所有对象
      while (iterations < maxIterations) {
        iterations++;

        const url = cursor
          ? `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects?cursor=${encodeURIComponent(cursor)}`
          : `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects`;

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();

          if (data.success && data.result && Array.isArray(data.result)) {
            // 统计当前页的对象
            for (const obj of data.result) {
              finalCount++;
              finalTotalSize += obj.size || 0;
            }

            console.log(`API iteration ${iterations}: ${data.result.length} objects, total: ${finalCount}, size: ${finalTotalSize} bytes`);

            // 检查是否还有更多数据
            if (data.result_info && data.result_info.is_truncated && data.result_info.cursor) {
              cursor = data.result_info.cursor;
            } else {
              // 没有更多数据了
              break;
            }
          } else {
            console.error('Invalid API response format');
            break;
          }
        } else {
          console.error('Cloudflare API error:', response.status, response.statusText);
          break;
        }
      }

      console.log(`R2 bucket stats from API: ${finalCount} objects, ${finalTotalSize} bytes (${formatSize(finalTotalSize)})`);
    } catch (e) {
      console.error('Error calling Cloudflare API:', e);
    }

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

    // 缓存统计信息（缓存1天）
    await env.IMG_EXPIRY.put('stats:cache', JSON.stringify({
      data: statsDataResponse,
      lastUpdate: Date.now(),
    }), {
      expirationTtl: 24 * 60 * 60  // 1天
    });

    // 清除dirty标记
    await env.IMG_EXPIRY.delete('stats:dirty');

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
            storage: formatSize(CONSTANTS.STORAGE_LIMIT),
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

  // 90% 强制停止警告
  if (storagePercent >= 90) {
    warnings.push('存储空间已达到 90% 上限，上传服务已暂停！');
  }
  // 70% 警告
  else if (storagePercent >= 70) {
    warnings.push('存储空间使用超过 70%，建议开始清理旧图片。');
  }

  if (readPercent >= CONSTANTS.READ_WARNING_THRESHOLD * 100) {
    warnings.push('今日读取次数接近上限！');
  } else if (readPercent >= CONSTANTS.READ_NOTIFY_THRESHOLD * 100) {
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
    // 测试 R2 list 方法
    const list = await env.IMAGES.list({ limit: 10 });
    
    // 测试 R2 S3 API
    let s3Result = null;
    let s3Error = null;
    
    try {
      const accessKeyId = env.R2_S3_ACCESS_KEY_ID;
      const secretAccessKey = env.R2_S3_SECRET_ACCESS_KEY;
      const endpoint = env.R2_S3_ENDPOINT;
      const bucketName = env.R2_BUCKET_NAME || 'img2url-images';
      
      if (accessKeyId && secretAccessKey && endpoint) {
        const s3Client = new S3Client({
          region: 'auto',
          endpoint: endpoint,
          credentials: {
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
          },
        });
        
        const command = new ListObjectsV2Command({
          Bucket: bucketName,
          MaxKeys: 10,
        });
        
        const response = await s3Client.send(command);
        s3Result = {
          count: response.Contents ? response.Contents.length : 0,
          isTruncated: response.IsTruncated,
          nextContinuationToken: response.NextContinuationToken,
          objects: response.Contents ? response.Contents.map(obj => ({
            key: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified,
          })) : [],
        };
      }
    } catch (e) {
      s3Error = {
        message: e instanceof Error ? e.message : String(e),
        name: e instanceof Error ? e.name : 'Unknown',
      };
      console.error('S3 API error:', e);
    }
    
    return corsResponse(
      '*',
      JSON.stringify({
        r2List: {
          bindingName: 'IMAGES',
          truncated: list.truncated,
          cursor: list.cursor,
          keysCount: list.keys ? list.keys.length : 0,
          keys: list.keys ? list.keys.map(k => ({
            name: k.name,
            size: k.size,
            uploaded: k.uploaded
          })) : []
        },
        s3Api: {
          success: !!s3Result,
          error: s3Error,
          data: s3Result
        }
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
            success: true,
            code: 200,
            data: {
              url: `${customDomain}/4345c068.webp`,
              fileName: '4345c068.webp',
              size: 1042,
              type: 'image/png',
              timestamp: '2026-03-02 20:46:57',
              expirationTime: null,
              expirationDays: null,
              remainingUploads: 497,
            },
          },
          errors: [
            {
              success: false,
              code: 400,
              error: 'MISSING_FILE',
              message: '未提供文件',
            },
            {
              success: false,
              code: 400,
              error: 'INVALID_FILE_TYPE',
              message: '只允许上传图片文件',
            },
            {
              success: false,
              code: 400,
              error: 'FILE_TOO_LARGE',
              message: '文件大小超过10MB限制',
            },
            {
              success: false,
              code: 400,
              error: 'IMAGE_TOO_LARGE',
              message: '图片尺寸超过10000x10000限制',
            },
            {
              success: false,
              code: 403,
              error: 'CAPTCHA_REQUIRED',
              message: '高频率上传需要人机验证',
            },
            {
              success: false,
              code: 403,
              error: 'CAPTCHA_FAILED',
              message: '验证码验证失败',
            },
            {
              success: false,
              code: 403,
              error: 'CAPTCHA_USED',
              message: '验证码已被使用',
            },
            {
              success: false,
              code: 429,
              error: 'RATE_LIMIT_EXCEEDED',
              message: '上传频率过高，请稍后再试（每分钟最多30次）',
            },
            {
              success: false,
              code: 507,
              error: 'STORAGE_FULL',
              message: '存储空间已满，请稍后再试',
            },
            {
              success: false,
              code: 500,
              error: 'UPLOAD_FAILED',
              message: '上传失败',
            },
            {
              success: false,
              code: 500,
              error: 'CONFIG_ERROR',
              message: '配置错误',
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
            success: true,
            data: {
              images: 100,
              totalSize: 1234567890,
              totalSizeFormatted: '1.15 GB',
              storageUsage: 11.5,
              readCount: 50000,
              readLimit: 1000000,
              readUsage: 5,
              limits: {
                storage: '10.00 GB',
                read: 1000000,
              },
              warnings: [],
            },
            cached: false,
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
// formData.append('expiration', '30'); // 可选：有效期天数（0=永久）

fetch('${customDomain}/upload', {
  method: 'POST',
  body: formData,
})
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      console.log('图片URL:', data.data.url);
    } else {
      console.error('上传失败:', data.message);
    }
  })
  .catch(error => {
    console.error('请求错误:', error);
  });`,

      python: `import requests

# 上传图片
files = {'file': open('image.jpg', 'rb')}
data = {'expiration': '30'}  # 可选：有效期天数（0=永久）

try:
  response = requests.post(
    '${customDomain}/upload',
    files=files,
    data=data
  )
  
  result = response.json()
  if result['success']:
    print('图片URL:', result['data']['url'])
  else:
    print('上传失败:', result['message'])
except Exception as e:
  print('请求错误:', str(e))
finally:
  files['file'].close()  # 关闭文件`,

      php: `<?php
// 上传图片
$ch = curl_init('${customDomain}/upload');
$cfile = new CURLFile('image.jpg');
$data = [
  'file' => $cfile,
  'expiration' => '30'  // 可选：有效期天数（0=永久）
];

curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode === 200) {
  $result = json_decode($response, true);
  if ($result['success']) {
    echo '图片URL: ' . $result['data']['url'] . PHP_EOL;
  } else {
    echo '上传失败: ' . $result['message'] . PHP_EOL;
  }
} else {
  echo 'HTTP错误: ' . $httpCode . PHP_EOL;
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
    const READ_LIMIT = CONSTANTS.READ_LIMIT;
    
    // 如果读取次数超过阈值，返回警告
    if (readCount >= READ_LIMIT * CONSTANTS.READ_WARNING_THRESHOLD) {
      console.warn(`Read limit nearly reached: ${readCount}/${READ_LIMIT}`);
    }
    
    // 检查单个 IP 的访问频率限制
    const ipRateKey = `rate:${clientIP}:${Math.floor(Date.now() / 60000)}`;
    const ipRateCount = await env.IMG_EXPIRY.get(ipRateKey);
    const currentIpRate = ipRateCount ? parseInt(ipRateCount) : 0;
    
    if (currentIpRate >= CONSTANTS.MAX_READS_PER_MINUTE) {
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