import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { UserDB, ClientConfigDB, OtpDB, query } from '../database/db.js';
import { signToken, requireAdmin, requireAuth } from './authMiddleware.js';
import { ComunicacaoService } from '../services/comunicacaoService.js';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }

  const user = await UserDB.findByEmail(email.toLowerCase().trim());
  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    clientId: user.client_id || undefined,
    name: user.name || undefined
  });

  const clientCfg = user.client_id ? await ClientConfigDB.findByClientId(user.client_id) : await ClientConfigDB.findByUserId(user.id);
  const isPlanActive = clientCfg ? Number(clientCfg.plan_active) === 1 && Number(clientCfg.is_active) === 1 : true;

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      clientId: user.client_id,
      name: user.name,
      whatsapp: user.whatsapp,
      whatsappValidado: Number(user.whatsapp_validado) === 1,
      planActive: isPlanActive
    }
  });
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

  const user = await UserDB.findById(req.user.userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  let clientConfig = null;
  const cfg = (user.client_id ? await ClientConfigDB.findByClientId(user.client_id) : null)
    || await ClientConfigDB.findByUserId(user.id);

  if (cfg) {
    const isVitrine = cfg.plan_type === 'VITRINE';
    const now = Date.now();
    const expiresAt = cfg.plan_expires_at ? Number(cfg.plan_expires_at) : null;
    const isExpired = expiresAt !== null && expiresAt < now;
    const isPlanActive = Number(cfg.plan_active) === 1 && Number(cfg.is_active) === 1 && !isExpired && !isVitrine;

    clientConfig = {
      clientId: cfg.client_id,
      riskPct: Number(cfg.risk_pct),
      leverage: Number(cfg.leverage),
      maxDailyLossUsd: Number(cfg.max_daily_loss_usd),
      maxDailyProfitUsd: Number(cfg.max_daily_profit_usd),
      balance: Number(cfg.balance),
      isActive: Number(cfg.is_active) === 1,
      syncEnabled: Number(cfg.sync_enabled) === 1,
      apiConnected: Number(cfg.api_connected) === 1,
      bybitTestnet: Number(cfg.bybit_testnet) === 1,
      hasApiKeys: !!(cfg.bybit_api_key_enc),
      notificationPhone: cfg.notification_phone,
      planType: cfg.plan_type || 'VITRINE',
      planExpiresAt: expiresAt,
      planActive: isPlanActive,
      isVitrine,
      isVitalicio: cfg.plan_type === 'VITALICIO',
      isExpired
    };
  }

  res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    whatsapp: user.whatsapp,
    whatsappValidado: Number(user.whatsapp_validado) === 1,
    planActive: clientConfig ? clientConfig.planActive : false,
    planType: clientConfig?.planType || 'VITRINE',
    clientConfig
  });
});

// POST /api/auth/signup — Cadastro obrigatório com Nome, Email, Senha e WhatsApp (inicia no Modo Vitrine)
authRouter.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, name, whatsapp } = req.body;
    if (!email || !password || !name || !whatsapp) {
      return res.status(400).json({ error: 'Nome, WhatsApp, email e senha são obrigatórios.' });
    }

    const cleanPhone = String(whatsapp).replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return res.status(400).json({ error: 'Número de WhatsApp inválido. Informe com DDD.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    const existing = await UserDB.findByEmail(email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ error: 'Este email já está cadastrado. Faça login.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const userId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const clientId = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    await UserDB.create({
      id: userId,
      email: email.toLowerCase().trim(),
      passwordHash: hash,
      role: 'CLIENT',
      clientId,
      name: name.trim(),
      whatsapp: cleanPhone,
      whatsappValidado: false,
      planActive: true
    });

    await ClientConfigDB.create({
      clientId,
      userId,
      name: name.trim(),
      notificationPhone: cleanPhone,
      planType: 'VITRINE',
      planActive: false,
      syncEnabled: false
    });

    // Disparar mensagem de Onboarding Anti-Spam via Railway Comunicação
    try {
      await ComunicacaoService.sendOnboardingMessage(name.trim(), cleanPhone);
    } catch (err: any) {
      console.error('[Signup] Erro ao disparar mensagem de onboarding WhatsApp:', err.message);
    }

    const token = signToken({
      userId,
      email: email.toLowerCase().trim(),
      role: 'CLIENT',
      clientId,
      name: name.trim()
    });

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: userId,
        email: email.toLowerCase().trim(),
        role: 'CLIENT',
        clientId,
        name: name.trim(),
        whatsapp: cleanPhone,
        whatsappValidado: false,
        planActive: false,
        planType: 'VITRINE'
      }
    });
  } catch (error: any) {
    console.error('[Signup] Erro geral ao cadastrar:', error);
    return res.status(500).json({ error: error.message || 'Erro ao cadastrar conta.' });
  }
});

// POST /api/auth/forgot-password — Gera OTP numérico de 6 dígitos e envia por WhatsApp
authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const { identifier } = req.body; // pode ser email ou whatsapp
  if (!identifier) {
    return res.status(400).json({ error: 'Informe seu e-mail ou WhatsApp cadastrado.' });
  }

  const cleanIdent = String(identifier).trim().toLowerCase();
  let user = await UserDB.findByEmail(cleanIdent);

  if (!user) {
    const cleanPhone = cleanIdent.replace(/\D/g, '');
    if (cleanPhone.length >= 8) {
      user = await UserDB.findByWhatsApp(cleanPhone);
    }
  }

  if (!user || !user.whatsapp) {
    // Por segurança e UX, se não encontrar o usuário com WhatsApp cadastrado
    return res.status(404).json({ error: 'Usuário com este WhatsApp/e-mail não localizado ou sem número cadastrado.' });
  }

  // Gerar OTP de 6 dígitos (100000 - 999999)
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutos
  const otpId = `otp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  await OtpDB.create({
    id: otpId,
    email: user.email,
    phone: user.whatsapp,
    otpCode,
    expiresAt
  });

  // Enviar código OTP via WhatsApp
  const sent = await ComunicacaoService.sendOtpMessage(user.whatsapp, otpCode);

  if (!sent) {
    return res.status(502).json({ error: 'Falha ao enviar mensagem de WhatsApp pelo serviço de comunicação. Tente novamente em instantes.' });
  }

  // Mascarar telefone para exibição: (XX) *****-1234
  const phone = user.whatsapp;
  const maskedPhone = phone.length >= 4 
    ? phone.slice(0, 2) + ' •••••-' + phone.slice(-4) 
    : phone;

  res.json({
    success: true,
    message: `Código de 6 dígitos enviado para o WhatsApp com final ${maskedPhone}.`,
    maskedPhone
  });
});

// POST /api/auth/reset-password-otp — Valida OTP e redefine a nova senha
authRouter.post('/reset-password-otp', async (req: Request, res: Response) => {
  const { otp, newPassword, identifier } = req.body;
  if (!otp || !newPassword) {
    return res.status(400).json({ error: 'Código OTP e nova senha são obrigatórios.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
  }

  const cleanOtp = String(otp).trim();
  let validOtp = null;
  if (identifier) {
    const cleanIdent = String(identifier).trim().toLowerCase();
    const user = (await UserDB.findByEmail(cleanIdent)) || (await UserDB.findByWhatsApp(cleanIdent.replace(/\D/g, '')));
    if (user) {
      validOtp = await OtpDB.findValid(user.email, cleanOtp);
    }
  }
  if (!validOtp) {
    validOtp = await OtpDB.findByCode(cleanOtp);
  }

  if (!validOtp) {
    return res.status(400).json({ error: 'Código de verificação inválido ou expirado (válido por 10 min).' });
  }

  const user = await UserDB.findByEmail(validOtp.email);
  if (!user) {
    return res.status(404).json({ error: 'Usuário associado a este código não foi localizado.' });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await UserDB.updatePassword(user.id, hash);
  await OtpDB.markUsed(validOtp.id);

  res.json({
    success: true,
    message: 'Senha redefinida com sucesso! Você já pode fazer login.'
  });
});

// POST /api/auth/register — Cadastro criado por Admin
authRouter.post('/register', requireAdmin, async (req: Request, res: Response) => {
  const { email, password, name, whatsapp, role = 'CLIENT' } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, senha e nome são obrigatórios.' });
  }

  const existing = await UserDB.findByEmail(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: 'Email já cadastrado.' });
  }

  const cleanPhone = whatsapp ? String(whatsapp).replace(/\D/g, '') : null;
  const hash = await bcrypt.hash(password, 12);
  const userId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const clientId = role === 'CLIENT' ? `cli-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : undefined;

  try {
    await UserDB.create({
      id: userId,
      email: email.toLowerCase().trim(),
      passwordHash: hash,
      role,
      clientId,
      name: name.trim(),
      whatsapp: cleanPhone || undefined,
      whatsappValidado: false,
      planActive: true
    });

    if (role === 'CLIENT' && clientId) {
      await ClientConfigDB.create({ 
        clientId, 
        userId, 
        name: name.trim(),
        notificationPhone: cleanPhone || undefined,
        syncEnabled: true 
      });
    }

    res.status(201).json({
      success: true,
      userId,
      clientId,
      email: email.toLowerCase().trim(),
      role,
      name
    });
  } catch (err: any) {
    console.error('[AuthRoutes] Erro no cadastro:', err);
    try { await query('DELETE FROM app_users WHERE id = $1', [userId]); } catch (e) {}
    res.status(500).json({ error: 'Erro interno ao salvar dados do cliente.' });
  }
});

// POST /api/auth/change-password
authRouter.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Senha nova deve ter no mínimo 8 caracteres.' });
  }

  const user = await UserDB.findById(req.user!.userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const match = await bcrypt.compare(currentPassword, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Senha atual incorreta.' });

  const hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE app_users SET password_hash = $1, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE id = $2', [hash, user.id]);

  res.json({ success: true, message: 'Senha alterada com sucesso.' });
});

