// src/server.ts
import dotenv from 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import adminRoutes from './routes/admin.routes';

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares Globais
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rota de Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Registro de Rotas
app.use('/api/admin', adminRoutes);

// Inicialização do Servidor
app.listen(PORT, () => {
  console.log(`🚀 SaaS License API rodando na porta ${PORT}`);
});