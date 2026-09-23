type SendPinInput = { to: string; pin: string; apiKey?: string; fromEmail?: string; fetchImpl?: typeof fetch };

export async function sendEmailPin({ to, pin, apiKey = process.env.RESEND_API_KEY || '', fromEmail = process.env.RESEND_FROM_EMAIL || 'seguranca@uebamix.com.br', fetchImpl = fetch }: SendPinInput) {
  if (!apiKey) return { success: true, dev: true };
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${process.env.EMAIL_FROM_NAME || 'MarketFlow Pro'} <${fromEmail}>`, to: [to], subject: 'Código de verificação', html: `<p>Seu código: <strong>${pin}</strong></p>` })
  });
  const body = await response.json() as { error?: { message?: string } };
  if (!response.ok || body.error) return { success: false, error: body.error?.message || 'Falha ao enviar e-mail.' };
  return { success: true };
}
