import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import authRouter from './routes/auth';
import itemsRouter from './routes/items';
import teamsRouter from './routes/teams';
import { authenticate } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import prisma from './lib/prisma';
import { startOutboxWorker } from './workers/outboxWorker';

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/items', authenticate, itemsRouter);
app.use('/api/teams', authenticate, teamsRouter);

// Error handler (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
// Guarded so supertest can import `app` without binding a port
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
    startOutboxWorker();
  });
}

export { prisma };
export default app;
