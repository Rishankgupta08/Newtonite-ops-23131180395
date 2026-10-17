import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import authRouter from './routes/auth';
import { errorHandler } from './middleware/errorHandler';
import prisma from './lib/prisma';

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Routes
app.use('/api/auth', authRouter);

// Error handler (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
// Guarded so supertest can import `app` without binding a port
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
  });
}

export { prisma };
export default app;
