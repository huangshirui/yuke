import { router, type WorkerEnv } from './router'

export default {
  async fetch(request: Request, env: WorkerEnv, executionCtx: unknown): Promise<Response> {
    return router({ request, env, executionCtx })
  }
}
