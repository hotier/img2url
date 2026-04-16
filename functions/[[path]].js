const CONSTANTS = {
  MAX_IMAGE_SIZE: 5 * 1024 * 1024,
  MAX_AGE: 60 * 60 * 24 * 30,
  SHORT_ID_LENGTH: 7,
};

function formatTimestamp() {
  const now = new Date();
  const shanghaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const year = shanghaiTime.getFullYear();
  const month = String(shanghaiTime.getMonth() + 1).padStart(2, '0');
  const day = String(shanghaiTime.getDate()).padStart(2, '0');
  const hours = String(shanghaiTime.getHours()).padStart(2, '0');
  const minutes = String(shanghaiTime.getMinutes()).padStart(2, '0');
  const seconds = String(shanghaiTime.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} (UTC+8)`;
}

function errorResponse(status, code, message) {
  return new Response(JSON.stringify({ 
    success: false, 
    error: { code, message } 
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  });
}

function successResponse(data, status = 200) {
  return new Response(JSON.stringify({ 
    success: true, 
    data 
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  });
}

function corsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  });
}

function verifyReferer(request, env) {
  const referer = request.headers.get('Referer');
  const origin = request.headers.get('Origin');
  
  const customDomain = env.CUSTOM_DOMAIN;
  const requestOrigin = new URL(request.url).origin;
  
  const allowedOrigins = [requestOrigin];
  if (customDomain) {
    try {
      const customUrl = new URL(customDomain);
      allowedOrigins.push(customUrl.origin);
    } catch (e) {
      console.warn('Invalid CUSTOM_DOMAIN:', customDomain);
    }
  }
  
  if (origin) {
    return allowedOrigins.includes(origin);
  }
  
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      return allowedOrigins.includes(refererUrl.origin);
    } catch (e) {
      return false;
    }
  }
  
  return false;
}

async function verifyTurnstile(token, env) {
  if (!token) {
    return { valid: false, error: 'No token provided' };
  }
  
  const secretKey = env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    console.warn('TURNSTILE_SECRET_KEY not configured, skipping verification');
    return { valid: true };
  }
  
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
    });
    
    const result = await response.json();
    
    if (result.success) {
      return { valid: true };
    } else {
      console.error('Turnstile verification failed:', result['error-codes']);
      return { valid: false, error: result['error-codes'] };
    }
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return { valid: false, error: error.message };
  }
}

function generateShortId(length = CONSTANTS.SHORT_ID_LENGTH) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

async function generateUniqueShortId(env) {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const shortId = generateShortId();
    const existing = await env.IMAGES.get(shortId);
    if (!existing) {
      return shortId;
    }
    attempts++;
  }
  
  return generateShortId(CONSTANTS.SHORT_ID_LENGTH + 2);
}

async function handleUpload(request, env) {
  if (request.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Only POST requests are allowed');
  }

  const contentType = request.headers.get('Content-Type');
  if (!contentType || !contentType.startsWith('multipart/form-data')) {
    return errorResponse(400, 'INVALID_CONTENT_TYPE', 'Content-Type must be multipart/form-data');
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const expiration = parseInt(formData.get('expiration') || '0', 10);
    const turnstileToken = formData.get('turnstile');

    if (!file || file.size === 0) {
      return errorResponse(400, 'NO_FILE_PROVIDED', 'No file provided');
    }

    if (expiration < 0 || expiration > 365) {
      return errorResponse(400, 'INVALID_EXPIRATION', 'Expiration must be between 0 and 365 days');
    }

    if (file.size > CONSTANTS.MAX_IMAGE_SIZE) {
      return errorResponse(413, 'FILE_TOO_LARGE', `File size exceeds ${CONSTANTS.MAX_IMAGE_SIZE / 1024 / 1024}MB limit`);
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
    if (!allowedTypes.includes(file.type)) {
      return errorResponse(400, 'INVALID_FILE_TYPE', 'File type not allowed. Only JPEG, PNG, GIF, WebP, and AVIF are supported.');
    }

    if (turnstileToken) {
      const turnstileResult = await verifyTurnstile(turnstileToken, env);
      if (!turnstileResult.valid) {
        return errorResponse(403, 'CAPTCHA_FAILED', 'Captcha verification failed');
      }
    }

    const arrayBuffer = await file.arrayBuffer();

    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const hashKey = `hash:${hashHex}`;
    const existingMapping = await env.IMAGES.get(hashKey);
    
    if (existingMapping) {
      const mappingText = await existingMapping.text();
      const mapping = JSON.parse(mappingText);
      const baseUrl = env.CUSTOM_DOMAIN || new URL(request.url).origin;
      const existingUrl = `${baseUrl}/file/${mapping.shortId}`;
      const uploadedAt = mapping.uploadedAt ? formatTimestamp(new Date(mapping.uploadedAt)) : formatTimestamp();
      return successResponse({
        url: existingUrl,
        fileName: mapping.shortId,
        originalName: mapping.originalName,
        size: mapping.size,
        type: mapping.type,
        message: 'File already exists',
        expiration: 0,
        expirationDays: 0,
        duplicate: true,
        uploadedAt: uploadedAt
      });
    }

    const shortId = await generateUniqueShortId(env);
    const expiryDate = expiration > 0
      ? new Date(Date.now() + expiration * 24 * 60 * 60 * 1000)
      : null;

    const originalExtension = file.name.split('.').pop() || 'jpg';
    const originalName = file.name;

    await env.IMAGES.put(shortId, arrayBuffer, {
      httpMetadata: { contentType: 'image/webp' },
      customMetadata: {
        uploadedAt: new Date().toISOString(),
        expiration: expiryDate ? expiryDate.toISOString() : '0',
        originalName: originalName,
        originalType: file.type,
        hash: hashHex
      }
    });

    await env.IMAGES.put(hashKey, JSON.stringify({
      shortId: shortId,
      originalName: originalName,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString()
    }), {
      customMetadata: {
        type: 'hash-mapping'
      }
    });

    const baseUrl = env.CUSTOM_DOMAIN || new URL(request.url).origin;
    const imageUrl = `${baseUrl}/file/${shortId}`;

    const expirationDays = expiration > 0 ? expiration : null;

    return successResponse({
      url: imageUrl,
      fileName: shortId,
      originalName: originalName,
      size: file.size,
      type: file.type,
      uploadedAt: formatTimestamp(),
      expiration: expirationDays,
      expirationDays: expirationDays,
      duplicate: false,
      uploadCount: 1
    });
  } catch (error) {
    console.error('Upload error:', error);
    return errorResponse(500, 'UPLOAD_FAILED', 'Failed to upload image');
  }
}

async function handleImage(request, env, imageName) {
  if (request.method !== 'GET') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Only GET requests are allowed');
  }

  try {
    const object = await env.IMAGES.get(imageName);
    if (!object) {
      return errorResponse(404, 'IMAGE_NOT_FOUND', 'Image not found');
    }

    const headers = new Headers();
    headers.set('Content-Type', 'image/webp');
    headers.set('Cache-Control', `public, max-age=${CONSTANTS.MAX_AGE}`);
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(object.body, { headers });
  } catch (error) {
    console.error('Image retrieval error:', error);
    return errorResponse(500, 'SERVER_ERROR', 'Failed to retrieve image');
  }
}

async function handleDelete(request, env, imageName) {
  if (request.method !== 'DELETE') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Only DELETE requests are allowed');
  }

  if (!verifyReferer(request, env)) {
    return errorResponse(403, 'FORBIDDEN', 'Access denied: request must originate from this website');
  }

  try {
    const object = await env.IMAGES.get(imageName);
    if (!object) {
      return errorResponse(404, 'IMAGE_NOT_FOUND', 'Image not found');
    }

    const hash = object.customMetadata?.hash;
    if (hash) {
      await env.IMAGES.delete(`hash:${hash}`);
    }

    await env.IMAGES.delete(imageName);

    return successResponse({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    return errorResponse(500, 'DELETE_FAILED', 'Failed to delete image');
  }
}

async function handleCleanup(request, env) {
  if (request.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Only POST requests are allowed');
  }

  if (!verifyReferer(request, env)) {
    return errorResponse(403, 'FORBIDDEN', 'Access denied: request must originate from this website');
  }

  try {
    let cursor;
    let deletedCount = 0;

    do {
      const options = { limit: 1000 };
      if (cursor) {
        options.cursor = cursor;
      }
      const objects = await env.IMAGES.list(options);

      for (const object of objects.objects) {
        if (object.key.startsWith('hash:')) {
          continue;
        }
        
        const now = Date.now();
        const expiration = object.customMetadata?.expiration;
        
        if (!expiration || expiration === '0') {
          continue;
        }
        
        const expiry = new Date(expiration).getTime();
        
        if (expiry <= now) {
          const hash = object.customMetadata?.hash;
          if (hash) {
            await env.IMAGES.delete(`hash:${hash}`);
          }
          await env.IMAGES.delete(object.key);
          deletedCount++;
        }
      }

      cursor = objects.cursor;
    } while (cursor);

    return successResponse({ deleted: deletedCount, timestamp: formatTimestamp() });
  } catch (error) {
    console.error('Cleanup error:', error);
    return errorResponse(500, 'CLEANUP_FAILED', 'Failed to cleanup expired images');
  }
}

async function handleStats(request, env) {
  if (request.method !== 'GET') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Only GET requests are allowed');
  }

  try {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID || '';
    const apiToken = env.CLOUDFLARE_API_TOKEN || '';

    if (!accountId || !apiToken) {
      return errorResponse(400, 'MISSING_CONFIG', 'CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN not configured');
    }

    const headers = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };

    const bucketsUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`;
    let bucketsResponse;
    try {
      bucketsResponse = await fetch(bucketsUrl, { headers });
    } catch (fetchError) {
      throw new Error(`Network error fetching buckets: ${fetchError.message}`);
    }

    if (!bucketsResponse.ok) {
      const errorText = await bucketsResponse.text();
      throw new Error(`Failed to list buckets: ${bucketsResponse.status} ${errorText}`);
    }

    const bucketsData = await bucketsResponse.json();
    if (!bucketsData.success) {
      throw new Error(`API error: ${bucketsData.errors?.[0]?.message || 'Unknown error'}`);
    }

    const buckets = bucketsData.result?.buckets || [];
    let totalSize = 0;
    let totalCount = 0;

    for (const bucket of buckets) {
      const bucketName = bucket.name;
      
      const usageUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/usage`;
      let usageResponse;
      try {
        usageResponse = await fetch(usageUrl, { headers });
      } catch (fetchError) {
        console.warn(`Network error fetching usage for ${bucketName}: ${fetchError.message}`);
        continue;
      }
      
      if (usageResponse.ok) {
        const usageData = await usageResponse.json();
        if (usageData.success && usageData.result) {
          totalSize += parseInt(usageData.result.payloadSize, 10) || 0;
          totalCount += parseInt(usageData.result.objectCount, 10) || 0;
        }
      }
    }

    const storageLimit = 10 * 1024 * 1024 * 1024;
    const usagePercent = ((totalSize / storageLimit) * 100).toFixed(2);

    const stats = {
      totalBuckets: buckets.length,
      totalImages: totalCount,
      totalSize: totalSize,
      totalSizeHuman: formatFileSize(totalSize),
      storageLimit: storageLimit,
      storageLimitHuman: formatFileSize(storageLimit),
      usagePercent: parseFloat(usagePercent),
      timestamp: formatTimestamp(),
    };

    return successResponse(stats);
  } catch (error) {
    console.error('Stats error:', error);
    return errorResponse(500, 'STATS_FAILED', error.message || 'Failed to get stats');
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function handleHealth(request, env) {
  if (request.method !== 'GET') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Only GET requests are allowed');
  }

  const health = {
    status: 'ok',
    code: 200,
    timestamp: formatTimestamp(),
    version: '1.0.0',
    endpoints: {},
  };

  let r2Ok = false;
  try {
    await env.IMAGES.list({ limit: 1 });
    r2Ok = true;
    health.endpoints.r2 = { status: 'ok', code: 200 };
  } catch (error) {
    health.endpoints.r2 = { status: 'error', code: 500, error: error.message };
    health.status = 'error';
    health.code = 500;
  }

  health.endpoints.upload = r2Ok 
    ? { status: 'ok', code: 200 } 
    : { status: 'error', code: 503, error: 'R2 unavailable' };
  
  health.endpoints.file = r2Ok 
    ? { status: 'ok', code: 200 } 
    : { status: 'error', code: 503, error: 'R2 unavailable' };
  
  health.endpoints.delete = r2Ok 
    ? { status: 'ok', code: 200 } 
    : { status: 'error', code: 503, error: 'R2 unavailable' };
  
  health.endpoints.cleanup = r2Ok 
    ? { status: 'ok', code: 200 } 
    : { status: 'error', code: 503, error: 'R2 unavailable' };

  try {
    const statsResult = await handleStats(request, env);
    const statsData = await statsResult.json();
    if (statsData.success) {
      health.endpoints.stats = { status: 'ok', code: 200 };
    } else {
      health.endpoints.stats = { status: 'error', code: 500, error: statsData.error?.message || 'Stats failed' };
      health.status = 'error';
      health.code = 500;
    }
  } catch (error) {
    health.endpoints.stats = { status: 'error', code: 500, error: error.message };
    health.status = 'error';
    health.code = 500;
  }

  health.endpoints.health = { status: 'ok', code: 200 };

  const accountId = env.CLOUDFLARE_ACCOUNT_ID || '';
  const apiToken = env.CLOUDFLARE_API_TOKEN || '';

  if (accountId && apiToken) {
    try {
      const response = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
        headers: { 'Authorization': `Bearer ${apiToken}` },
      });
      const data = await response.json();
      if (data.success) {
        health.endpoints.cloudflareApi = { status: 'ok', code: 200 };
      } else {
        health.endpoints.cloudflareApi = { status: 'error', code: 401, error: 'Token invalid' };
        health.status = 'error';
        health.code = 500;
      }
    } catch (error) {
      health.endpoints.cloudflareApi = { status: 'error', code: 500, error: error.message };
      health.status = 'error';
      health.code = 500;
    }
  } else {
    health.endpoints.cloudflareApi = { status: 'ok', code: 200 };
  }

  if (health.status === 'error') {
    health.code = 500;
  }

  return successResponse(health);
}

async function handleRequest(request, env, context) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return corsResponse();
  }

  if (path === '/upload') {
    return handleUpload(request, env);
  } else if (path.startsWith('/file/')) {
    const imageName = path.substring(6);
    return handleImage(request, env, imageName);
  } else if (path.startsWith('/delete/')) {
    const imageName = path.substring(8);
    return handleDelete(request, env, imageName);
  } else if (path === '/cleanup') {
    return handleCleanup(request, env);
  } else if (path === '/stats') {
    return handleStats(request, env);
  } else if (path === '/health') {
    return handleHealth(request, env);
  }

  if (env.ASSETS) {
    return env.ASSETS.fetch(request);
  }

  if (context && context.next) {
    return context.next();
  }

  return errorResponse(404, 'NOT_FOUND', 'Endpoint not found');
}

export async function onRequest(context) {
  return handleRequest(context.request, context.env, context);
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
};
