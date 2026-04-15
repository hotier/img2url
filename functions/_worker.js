import { createWorker } from './worker';

export default {  
  async fetch(request, env, ctx) {
    return createWorker(env).fetch(request, env, ctx);
  }
};