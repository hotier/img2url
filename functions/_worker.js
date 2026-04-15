import { createWorker } from './worker';

export default {
  fetch: (request, env, ctx) => {
    return createWorker(env).fetch(request, env, ctx);
  }
};