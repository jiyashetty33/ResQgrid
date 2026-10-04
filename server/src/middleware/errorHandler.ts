import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('[API Error]', err?.message || err);

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    data: null,
    error: {
      message,
      code: err.code || 'INTERNAL_ERROR',
    },
  });
}
