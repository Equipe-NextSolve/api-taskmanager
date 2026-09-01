# api-taskmanager

API de licenciamento e cobrança (billing) do **Task Manager Solve**. É um serviço separado, em Node/TypeScript, responsável por:

- Cadastrar e validar as licenças (`appKey`) de cada empresa que usa o Task Manager Solve;
- Processar assinaturas e pagamentos via **Asaas** (PIX/cartão);
- Renovar/expirar licenças automaticamente e avisar o sistema principal quando o status muda;
- Expor uma área administrativa para gerenciar tenants manualmente.

O Task Manager Solve (Next.js) fala com essa API por HTTP — na criação de conta, no checkout de planos pagos, e periodicamente pra validar se a licença da empresa ainda está ativa.

## Stack

- **Express 5** + **TypeScript**
- **Prisma** + **PostgreSQL** (via `@prisma/adapter-pg`)
- **Redis** (`ioredis`) — cache de validação de licença, rate limiting e idempotência de webhooks
- **Zod** — validação de payloads
- **JWT** (`jsonwebtoken`) — autenticação da área admin
- **Asaas** — gateway de pagamento (PIX e cartão de crédito)
- Deploy em **Vercel** (tem `vercel.json`) com um cron externo via **GitHub Actions**

## Estrutura

```
src/
  controllers/   # lógica de cada rota (admin, billing, cron, payment, public)
  middlewares/    # auth (JWT admin, appKey, webhook, cron-secret) e rate limit
  routes/         # definição das rotas Express, uma por área
  schemas/        # schemas Zod compartilhados
  utils/          # cálculo de status/expiração de licença, notificação de webhook
  lib/            # clientes Prisma e Redis
  constants/      # definição dos planos (FREE/BASIC/PRO/ADMIN)
prisma/
  schema.prisma   # modelos Tenant e LicenseLog
.github/workflows/
  sync-expired-tenants.yml  # cron diário que expira licenças vencidas
```

## Variáveis de ambiente

Crie um `.env` na raiz com:

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Connection string do Postgres usada pelo Prisma em runtime |
| `DIRECT_URL` | Connection string direta (sem pool), usada pelas migrations do Prisma |
| `JWT_SECRET` | Chave para assinar/verificar os tokens JWT da área admin |
| `JWT_EXPIRES_IN` | Validade do token admin gerado |
| `PORT` | Porta do servidor em desenvolvimento local |
| `REDIS_URL` | Connection string do Redis (cache de licença, rate limit, idempotência) |
| `ASAAS_API_KEY` | Chave de API do Asaas, usada nas chamadas de billing |
| `ASAAS_WEBHOOK_TOKEN` | Token esperado no header enviado pelo Asaas, valida que o webhook é legítimo |
| `ALLOWED_ORIGINS` | Origens liberadas no CORS, separadas por vírgula (obrigatório em produção) |
| `REGISTRATION_SECRET` | Segredo compartilhado com o Task Manager Solve — só quem tem esse header consegue cadastrar um novo tenant |
| `TASKMANAGER_WEBHOOK_URL` | URL do Task Manager Solve que recebe o aviso de mudança de status da licença |
| `TASKMANAGER_WEBHOOK_SECRET` | Segredo enviado nesse aviso, pro Task Manager Solve confirmar que veio daqui |
| `SYNC_ENDPOINT_URL` | URL pública da rota `/api/cron/sync-expired`, usada pelo GitHub Actions |
| `SYNC_CRON_SECRET` | Segredo enviado no header `x-cron-secret` pelo GitHub Actions pra autorizar o cron |

## Rodando localmente

```bash
npm install
npx prisma generate
npx prisma migrate dev   # aplica o schema no banco configurado em DIRECT_URL
npm run dev              # sobe com ts-node-dev na porta definida em PORT
```

Pra gerar um token de admin válido por 30 dias (usar nas rotas `/api/admin/*`):

```bash
npx ts-node src/generateToken.ts
```

Build de produção:

```bash
npm run build
npm start
```

## Rotas

Todas as rotas (exceto `/health`) ficam sob prefixos próprios, montados em `src/server.ts`.

### `POST /webhooks/asaas`
Recebe eventos de pagamento do Asaas (`verifyAsaasWebhook` valida o token do header, `webhookRateLimit` limita a 50 req/10s). Trata `PAYMENT_RECEIVED` (renova a licença e avisa o Task Manager Solve), `PAYMENT_OVERDUE` e `PAYMENT_DELETED` (só registram log). Idempotente por 48h via Redis, pra não processar o mesmo evento duas vezes.

### `GET /api/license/validate/:appKey`
Rota pública (com rate limit de 60/min) que o Task Manager Solve chama pra saber se a licença de uma empresa está válida. Retorna `ACTIVE`, `EXPIRING_SOON`, `GRACE_PERIOD` ou `INACTIVE`/`EXPIRED`, com cache no Redis (TTL varia conforme o status).

### `POST /api/public/register`
### `GET /api/public/check-availability`
Usadas no cadastro de uma nova empresa. Exigem o header `x-registration-secret` batendo com `REGISTRATION_SECRET`. `register` cria o tenant (gera `appKey`/`privateKey`, aplica os limites do plano) e bloqueia CPF/CNPJ que já usou o plano FREE ou que já tem conta paga. `check-availability` só confere se o CPF/CNPJ pode ser usado, sem criar nada.

### `/api/billing/*` (exige header `x-app-key` válido, via `verifyAppKey`)
- `GET /status` — status da assinatura do tenant
- `POST /customer` — cria o cliente no Asaas
- `POST /subscribe` / `DELETE /subscribe` — cria/cancela a assinatura
- `DELETE /cancel-account` — cancela uma conta ainda pendente de pagamento

### `/api/admin/*` (exige JWT de admin + rate limit de 30/min)
- CRUD de tenants: `GET/POST /tenants`, `GET/PATCH/DELETE /tenants/:id`
- Ações do Asaas por tenant: criar cliente, criar assinatura, cancelar assinatura

### `POST /api/cron/sync-expired`
Expira tenants vencidos. Protegida por `x-cron-secret` (`SYNC_CRON_SECRET`) e rate limit bem restrito (5/min) — só deve ser chamada pelo workflow do GitHub Actions.

### `GET /health`
Health check simples, sem autenticação.

## Cron de expiração

`.github/workflows/sync-expired-tenants.yml` roda todo dia às 06:00 UTC (03:00 em Brasília) e também pode ser disparado manualmente pela aba Actions do GitHub. Ele só faz um `curl` autenticado pra `/api/cron/sync-expired` — toda a lógica de fato mora no `cron.controller.ts`.

## Modelo de dados

- **Tenant** — uma linha por empresa cliente: dados de cadastro, `appKey`/`privateKey`, plano, status, vencimento, e o vínculo com o cliente/assinatura no Asaas.
- **LicenseLog** — histórico de eventos por tenant (registro, pagamento recebido/atrasado/removido, etc.), útil pra auditoria.

## Planos

| Plano | Preço mensal | Preço anual | Usuários | Projetos | Clientes | Retenção de log |
|---|---|---|---|---|---|---|
| FREE | R$ 0 | R$ 0 | 25 | 5 | 5 | 7 dias |
| BASIC | R$ 5 | R$ 24,90 | 100 | 100 | 100 | 15 dias |
| PRO | R$ 49,90 | R$ 39,90 | Ilimitado | Ilimitado | Ilimitado | 30 dias |
| ADMIN | — | — | Ilimitado | Ilimitado | Ilimitado | Ilimitado |

(`-1` no código = ilimitado. Todo plano dá 30 dias de acesso por ciclo, exceto o ADMIN, que é essencialmente permanente.)
