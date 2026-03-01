export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // 使用 R2 绑定列出对象
      const list = await env.IMAGES.list({ limit: 100 });
      
      let count = 0;
      let totalSize = 0;
      const objects = [];
      
      if (list.keys && list.keys.length > 0) {
        for (const key of list.keys) {
          count++;
          totalSize += key.size || 0;
          objects.push({
            key: key.name,
            size: key.size,
            uploaded: key.uploaded
          });
        }
      }
      
      return new Response(JSON.stringify({
        success: true,
        data: {
          count,
          totalSize,
          totalSizeFormatted: formatSize(totalSize),
          truncated: list.truncated,
          objects: objects
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}