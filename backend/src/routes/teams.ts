import { Router } from 'express';
import prisma from '../lib/prisma';
import { HttpError } from '../lib/errors';

// NOTE: `authenticate` is applied when this router is mounted in index.ts
const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.user.userId },
      include: { team: true },
      orderBy: { team: { name: 'asc' } },
    });
    res.json(memberships.map((m) => ({ id: m.team.id, name: m.team.name, role: m.role })));
  } catch (err) {
    next(err);
  }
});

router.get('/:teamId/members', async (req, res, next) => {
  try {
    const teamId = String(req.params.teamId);
    const own = await prisma.membership.findUnique({
      where: { userId_teamId: { userId: req.user.userId, teamId } },
    });
    if (!own) {
      throw new HttpError(403, 'Access denied: not a member of this team', 'FORBIDDEN');
    }
    const members = await prisma.membership.findMany({
      where: { teamId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: 'asc' } },
    });
    res.json(
      members.map((m) => ({
        userId: m.user.id,
        userName: m.user.name,
        userEmail: m.user.email,
        role: m.role,
      }))
    );
  } catch (err) {
    next(err);
  }
});

export default router;
