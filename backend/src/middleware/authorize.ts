import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

type Action = 'read' | 'write' | 'approve';

const ALLOWED_ROLES: Record<Action, string[]> = {
  read: ['VIEWER', 'MEMBER', 'LEAD', 'ADMIN'],
  write: ['MEMBER', 'LEAD', 'ADMIN'],
  approve: ['LEAD', 'ADMIN'],
};

export function requireItemAccess(action: Action) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await prisma.workItem.findUnique({
        where: { id: req.params.id as string },
        select: {
          id: true,
          teamId: true,
          status: true,
          assigneeId: true,
          version: true,
          title: true,
          priority: true,
          type: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!item) {
        return res.status(404).json({ error: 'Work item not found' });
      }

      const membership = await prisma.membership.findFirst({
        where: { userId: req.user.userId, teamId: item.teamId },
      });

      if (!membership) {
        return res.status(403).json({ error: 'Access denied: not a member of this team' });
      }

      if (!ALLOWED_ROLES[action].includes(membership.role)) {
        return res
          .status(403)
          .json({ error: `Access denied: role ${membership.role} cannot ${action}` });
      }

      req.workItem = item;
      req.userRole = membership.role;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
