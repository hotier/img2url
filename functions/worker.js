const CONSTANTS = {
  MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_IMAGE_WIDTH: 3840, // 4K
  MAX_IMAGE_HEIGHT: 2160, // 4K
  MAX_AGE: 60 * 60 * 24 * 30, // 30天
  RATE_LIMIT: 100, // 每IP每分钟请求数
  STORAGE_NOTIFY_THRESHOLD: 0.70, // 70%
  READ_NOTIFY_THRESHOLD: 0.70, // 70%
};

function formatTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function corsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
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

    const arrayBuffer = await file.arrayBuffer();

    try {
      const imageBitmap = await createImageBitmap(new Blob([arrayBuffer], { type: file.type }));
      if (imageBitmap.width > CONSTANTS.MAX_IMAGE_WIDTH || imageBitmap.height > CONSTANTS.MAX_IMAGE_HEIGHT) {
        imageBitmap.close();
        return errorResponse(400, 'IMAGE_TOO_LARGE', `Image dimensions exceed ${CONSTANTS.MAX_IMAGE_WIDTH}x${CONSTANTS.MAX_IMAGE_HEIGHT} limit`);
      }
      imageBitmap.close();
    } catch (e) {
      console.warn('Unable to validate image dimensions:', e);
    }

    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const fileExtension = file.name.split('.').pop() || 'jpg';
    const fileName = `${hashHex}.${fileExtension}`;

    const existingObject = await env.IMAGES.get(fileName);
    if (existingObject) {
      const existingUrl = `${env.CUSTOM_DOMAIN || 'https://api.hotier.cc.cd'}/i/${fileName}`;
      return successResponse({
        url: existingUrl,
        filename: fileName,
        size: file.size,
        type: file.type,
        message: 'File already exists',
        expiration: 0,
        expirationDays: 0
      });
    }

    const expiryDate = expiration > 0
      ? new Date(Date.now() + expiration * 24 * 60 * 60 * 1000)
      : null;

    await env.IMAGES.put(fileName, arrayBuffer, {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        uploadedAt: new Date().toISOString(),
        expiration: expiryDate ? expiryDate.toISOString() : '0'
      }
    });

    const imageUrl = `${env.CUSTOM_DOMAIN || 'https://api.hotier.cc.cd'}/i/${fileName}`;

    const expirationDays = expiration > 0 ? expiration : null;

    return successResponse({
      url: imageUrl,
      filename: fileName,
      size: file.size,
      type: file.type,
      uploadedAt: formatTimestamp(),
      expiration: expirationDays,
      expirationDays: expirationDays
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
    object.writeHttpMetadata(headers);
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

  try {
    const object = await env.IMAGES.get(imageName);
    if (!object) {
      return errorResponse(404, 'IMAGE_NOT_FOUND', 'Image not found');
    }

    await env.IMAGES.delete(imageName);
    await env.IMG_EXPIRY.delete(imageName);

    return successResponse({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    return errorResponse(500, 'DELETE_FAILED', 'Failed to delete image');
  }
}

async function handleCleanup(env) {
  try {
    let cursor = null;
    let deletedCount = 0;

    do {
      const objects = await env.IMAGES.list({ cursor, limit: 1000 });

      for (const object of objects.objects) {
        const now = Date.now();
        const expiry = object.customMetadata?.expiration
          ? new Date(object.customMetadata.expiration).getTime()
          : now;

        if (expiry > 0 && expiry <= now) {
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
    let totalSize = 0;
    let count = 0;

    let cursor = null;
    do {
      const objects = await env.IMAGES.list({ cursor, limit: 1000 });
      
      for (const object of objects.objects) {
        totalSize += object.size || 0;
        count++;
      }

      cursor = objects.cursor;
    } while (cursor);

    const stats = {
      totalImages: count,
      totalSize: totalSize,
      totalSizeHuman: formatFileSize(totalSize),
      timestamp: formatTimestamp(),
    };

    return successResponse(stats);
  } catch (error) {
    console.error('Stats error:', error);
    return errorResponse(500, 'STATS_FAILED', 'Failed to get stats');
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function handleSyncStats(request, env) {
  if (request.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Only POST requests are allowed');
  }

  try {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID || '';
    const apiToken = env.CLOUDFLARE_API_TOKEN || '';
    const bucketName = env.R2_BUCKET_NAME || 'img2url-images';

    let cursor = undefined;
    const maxIterations = 100;
    let iterations = 0;
    let totalSize = 0;
    let count = 0;

    while (cursor !== null && iterations < maxIterations) {
      const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects`);
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }
      url.searchParams.set('limit', '1000');

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(`API error: ${data.errors[0].message}`);
      }

      for (const object of data.result.objects) {
        totalSize += object.size || 0;
        count++;
      }

      cursor = data.result.cursor;
      iterations++;
    }

    const stats = {
      totalImages: count,
      totalSize: totalSize,
      totalSizeHuman: formatFileSize(totalSize),
      timestamp: formatTimestamp(),
    };

    return successResponse(stats);
  } catch (error) {
    console.error('Sync stats error:', error);
    return errorResponse(500, 'SYNC_STATS_FAILED', 'Failed to sync stats');
  }
}

async function handleHealth(request) {
  if (request.method !== 'GET') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Only GET requests are allowed');
  }

  return successResponse({
    status: 'ok',
    timestamp: formatTimestamp(),
    version: '1.0.0',
  });
}

async function handlePreview(request, env) {
  if (request.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Only POST requests are allowed');
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || file.size === 0) {
      return errorResponse(400, 'NO_FILE_PROVIDED', 'No file provided');
    }

    if (file.size > CONSTANTS.MAX_IMAGE_SIZE) {
      return errorResponse(413, 'FILE_TOO_LARGE', `File size exceeds ${CONSTANTS.MAX_IMAGE_SIZE / 1024 / 1024}MB limit`);
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
    if (!allowedTypes.includes(file.type)) {
      return errorResponse(400, 'INVALID_FILE_TYPE', 'File type not allowed. Only JPEG, PNG, GIF, WebP, and AVIF are supported.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: file.type });
    const url = URL.createObjectURL(blob);

    return successResponse({ previewUrl: url });
  } catch (error) {
    console.error('Preview error:', error);
    return errorResponse(500, 'PREVIEW_FAILED', 'Failed to generate preview');
  }
}

export function createWorker(env) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      const path = url.pathname;
      console.log(`[DEBUG] Request received: ${request.method} ${path}`);

      if (request.method === 'OPTIONS') {
        console.log(`[DEBUG] Handling OPTIONS request for ${path}`);
        return corsResponse();
      }

      if (path === '/upload') {
        console.log(`[DEBUG] Handling ${request.method} request for /upload`);
        return handleUpload(request, env);
      } else if (path.startsWith('/i/')) {
        const imageName = path.substring(3);
        console.log(`[DEBUG] Handling ${request.method} request for /i/${imageName}`);
        return handleImage(request, env, imageName);
      } else if (path.startsWith('/delete/')) {
        const imageName = path.substring(8);
        console.log(`[DEBUG] Handling ${request.method} request for /delete/${imageName}`);
        return handleDelete(request, env, imageName);
      } else if (path === '/cleanup') {
        console.log(`[DEBUG] Handling ${request.method} request for /cleanup`);
        return handleCleanup(env);
      } else if (path === '/stats') {
        console.log(`[DEBUG] Handling ${request.method} request for /stats`);
        return handleStats(request, env);
      } else if (path === '/sync-stats') {
        console.log(`[DEBUG] Handling ${request.method} request for /sync-stats`);
        return handleSyncStats(request, env);
      } else if (path === '/health') {
        console.log(`[DEBUG] Handling ${request.method} request for /health`);
        return handleHealth(request);
      } else if (path === '/preview') {
        console.log(`[DEBUG] Handling ${request.method} request for /preview`);
        return handlePreview(request, env);
      } else {
        console.log(`[DEBUG] Handling ${request.method} request for ${path} (404)`);
        return errorResponse(404, 'NOT_FOUND', 'Endpoint not found');
      }
    }
  };
}

