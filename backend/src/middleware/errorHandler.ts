import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err.statusCode) {
    return res
      .status(err.statusCode)
      .json({ error: err.message, code: err.code, currentItem: err.currentItem });
  }
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Conflict: duplicate entry' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}
