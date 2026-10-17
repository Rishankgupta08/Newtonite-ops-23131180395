import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      user: { userId: string; email: string; name: string };
      workItem: any; // set by requireItemAccess
      userRole: string; // set by requireItemAccess
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as jwt.JwtPayload;
    req.user = { userId: decoded.userId, email: decoded.email, name: decoded.name };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
