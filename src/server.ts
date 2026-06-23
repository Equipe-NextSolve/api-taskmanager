import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import webhookRoutes from './routes/webhook.routes';
import licenseRoutes from './routes/license.routes';
import adminRoutes from './routes/admin.routes';

const app = express();
const PORT = process.env.PORT || 3000;

// Confia no proxy reverso (Nginx, Railway, etc.) para obter o IP real
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '100kb' }));

app.use('/webhooks',    webhookRoutes);
app.use('/api/admin',  adminRoutes);
app.use('/api/license', licenseRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`SaaS API rodando na porta ${PORT}`);
  });
}

export default app;