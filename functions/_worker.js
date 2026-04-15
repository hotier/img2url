import { createWorker } from './worker';

/**
 * Cloudflare Pages Functions 入口
 * env 和 ctx 是 Cloudflare Workers 接口要求的参数
 */
export default {
  fetch: (request, env, ctx) => {
    return createWorker(env).fetch(request, env, ctx);
  }
};