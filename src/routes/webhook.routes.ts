import { Router } from 'express';
import { prisma } from '../lib/prisma'; // Importa a instância do Prisma que configuramos

const router = Router();

router.post('/asaas', async (req, res) => {
  const event = req.body;

  // Verifica se o evento é de pagamento recebido
  if (event.event === 'PAYMENT_RECEIVED') {
    // Calcula a nova data: 30 dias a partir de agora
    const novaDataExpiracao = new Date();
    novaDataExpiracao.setDate(novaDataExpiracao.getDate() + 30);

    try {
      // Atualiza o tenant encontrado pelo asaasCustomerId
      await prisma.tenant.update({
        where: { asaasCustomerId: event.payment.customer },
        data: { 
            expiresAt: novaDataExpiracao,
            status: true // Garante que a licença esteja ativa
        }
      });
      console.log(`Licença renovada para o cliente: ${event.payment.customer}`);
    } catch (error) {
      console.error('Erro ao atualizar licença via webhook:', error);
      // Retorna 500 se não encontrar o cliente ou der erro no banco
      res.status(500).send('Erro ao processar webhook');
      return;
    }
  }

  // O Asaas espera um status 200 para confirmar que você recebeu o webhook
  res.status(200).send();
});

export default router;