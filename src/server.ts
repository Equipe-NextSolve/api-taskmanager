import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import webhookRoutes from './routes/webhook.routes';
import licenseRoutes from './routes/license.routes';
import adminRoutes from './routes/admin.routes';
import publicRoutes  from './routes/public.routes';

const REQUIRED_ENV = [
    'DATABASE_URL',
    'JWT_SECRET',
    'REGISTRATION_SECRET',
    'ASAAS_API_KEY',
    'ASAAS_WEBHOOK_TOKEN',
] as const;

for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
        console.error(`[startup] Variável obrigatória não definida: ${key}`);
        process.exit(1);
    }
}

const getAllowedOrigins = (): string[] => {
    if (process.env.ALLOWED_ORIGINS) {
        return process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
    }
    if (process.env.NODE_ENV === 'production') {
        console.error('[startup] ALLOWED_ORIGINS não definido em produção. Defina a variável e reinicie.');
        process.exit(1);
    }
    return ['http://localhost:3000'];
};

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

app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} — IP: ${req.ip}`);
    next();
});

app.use('/webhooks',    webhookRoutes);
app.use('/api/admin',  adminRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/public', publicRoutes);

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[error] Erro não tratado:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor.' });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`SaaS API rodando na porta ${PORT}`);
  });
}

export default app;