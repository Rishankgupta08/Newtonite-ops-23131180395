import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'POST') return next();

  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || !key) return next();

  try {
    const record = await prisma.idempotencyKey.findUnique({ where: { key } });
    if (record) {
      return res.status(record.statusCode).json(record.responseBody);
    }
  } catch (err) {
    return next(err);
  }

  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    // Fire and forget: don't block the response on persistence
    prisma.idempotencyKey
      .create({ data: { key, responseBody: body, statusCode: res.statusCode } })
      .catch((err) => console.error('Idempotency save failed:', err));
    return originalJson(body);
  };
  return next();
}
