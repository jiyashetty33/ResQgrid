import { Router, Request, Response } from 'express';
import { getRepository } from '../db/index.js';
import { ENV } from '../config/env.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const repo = await getRepository();
    const repoHealth = await repo.getHealth();

    const aiMode = ENV.GEMINI_API_KEY && ENV.GEMINI_API_KEY.trim() !== '' ? 'gemini' : 'fallback';
    const automationMode = ENV.N8N_ENABLED ? 'n8n' : 'local';

    res.json({
      data: {
        status: 'ok',
        data: repoHealth.data,
        ai: aiMode,
        automation: automationMode,
        time: new Date().toISOString(),
      },
      error: null,
    });
  } catch (err: any) {
    res.status(500).json({
      data: null,
      error: { message: err?.message || 'Health check failed' },
    });
  }
});
