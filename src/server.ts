// src/server.ts
import dotenv from 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import webhookRoutes from './routes/webhook.routes';
import licenseRoutes from './routes/license.routes';

import adminRoutes from './routes/admin.routes';

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares Globais
app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/webhooks', webhookRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/license', licenseRoutes);

// Rota de Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});


// Inicialização do Servidor
app.listen(PORT, () => {
  console.log(`SaaS License API rodando na porta ${PORT}`);
});