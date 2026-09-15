import dotenv from 'dotenv';
dotenv.config();

const comunicacaoUrl = process.env.RAILWAY_COMUNICACAO_URL || process.env.COMUNICACAO_API_URL || 'https://comunicacao-hub-production.up.railway.app/api';
const apiKey = process.env.API_SECRET_KEY || process.env.COMUNICACAO_API_KEY || 'nexus_secret_hub_2026_x89a';
const defaultInstance = process.env.WHATSAPP_NUMERO_LICITACAO || process.env.DEFAULT_WHATSAPP_INSTANCE || 'licitacoes';

export interface SendWhatsAppParams {
  to: string;
  message: string;
  instance?: string;
}

export const ComunicacaoService = {
  /**
   * Envia mensagem WhatsApp via serviço de Comunicação do Railway usando a instância "licitacoes" (número licitação)
   */
  async sendWhatsApp({ to, message, instance }: SendWhatsAppParams): Promise<{ success: boolean; data?: any; error?: string }> {
    // Normalizar número (apenas dígitos)
    const cleanPhone = to.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      return { success: false, error: 'Número de WhatsApp inválido.' };
    }

    const targetInstance = instance || defaultInstance;

    try {
      const payload = {
        instance: targetInstance,
        to: cleanPhone,
        message
      };

      const response = await fetch(`${comunicacaoUrl}/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify(payload)
      });

      const resData = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.warn(`[ComunicacaoService] Falha ao enviar WhatsApp para ${cleanPhone} (instancia: ${targetInstance}):`, resData);
        return { success: false, error: resData.error || `HTTP ${response.status}` };
      }

      console.log(`[ComunicacaoService] ✅ WhatsApp enviado com sucesso para ${cleanPhone} (instância: ${targetInstance})`);
      return { success: true, data: resData };
    } catch (err: any) {
      console.error(`[ComunicacaoService] Erro de rede ao enviar WhatsApp para ${cleanPhone}:`, err.message);
      return { success: false, error: err.message };
    }
  },

  /**
   * Envia mensagem anti-spam de boas-vindas / onboarding
   */
  async sendOnboardingMessage(name: string, phone: string) {
    const firstName = name.trim().split(' ')[0] || name;
    const msg = `Olá, ${firstName}! Bem-vindo à nossa plataforma. Para ativar suas notificações e garantir que você receba nossos alertas operacionais, salve nosso contato e responda a esta mensagem com a palavra 'OK'.`;
    return this.sendWhatsApp({ to: phone, message: msg });
  },

  /**
   * Envia código OTP para recuperação de senha com CTA sutil anti-spam
   */
  async sendOtpMessage(phone: string, otpCode: string) {
    const msg = `Seu código de recuperação é: ${otpCode}. (Por favor, responda 'RECEBI' após acessar sua conta para encerrarmos este chamado).`;
    return this.sendWhatsApp({ to: phone, message: msg });
  }
};
