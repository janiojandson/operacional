import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { UserDB, ClientConfigDB } from '../database/db.js';
import { signToken, requireAdmin, requireAuth } from './authMiddleware.js';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }

  const user = UserDB.findByEmail(email.toLowerCase().trim());
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

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      clientId: user.client_id,
      name: user.name
    }
  });
});

// GET /api/auth/me — retorna dados do usuário autenticado
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

  const user = UserDB.findById(req.user.userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  let clientConfig = null;
  if (user.client_id) {
    const cfg = ClientConfigDB.findByClientId(user.client_id);
    if (cfg) {
      clientConfig = {
        clientId: cfg.client_id,
        riskPct: cfg.risk_pct,
        leverage: cfg.leverage,
        maxDailyLossUsd: cfg.max_daily_loss_usd,
        maxDailyProfitUsd: cfg.max_daily_profit_usd,
        balance: cfg.balance,
        isActive: cfg.is_active === 1,
        apiConnected: cfg.api_connected === 1,
        bybitTestnet: cfg.bybit_testnet === 1,
        hasApiKeys: !!(cfg.bybit_api_key_enc),
        notificationPhone: cfg.notification_phone
      };
    }
  }

  res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    clientConfig
  });
});

// POST /api/auth/register — apenas admin pode criar novos clientes
authRouter.post('/register', requireAdmin, async (req: Request, res: Response) => {
  const { email, password, name, role = 'CLIENT' } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, senha e nome são obrigatórios.' });
  }

  const existing = UserDB.findByEmail(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: 'Email já cadastrado.' });
  }

  const hash = await bcrypt.hash(password, 12);
  const userId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const clientId = role === 'CLIENT' ? `cli-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : undefined;

  UserDB.create({
    id: userId,
    email: email.toLowerCase().trim(),
    passwordHash: hash,
    role,
    clientId,
    name: name.trim()
  });

  if (role === 'CLIENT' && clientId) {
    ClientConfigDB.create({ clientId, userId, name: name.trim() });
  }

  res.status(201).json({
    success: true,
    userId,
    clientId,
    email: email.toLowerCase().trim(),
    role,
    name
  });
});

// POST /api/auth/change-password — alterar própria senha
authRouter.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Senha nova deve ter no mínimo 8 caracteres.' });
  }

  const user = UserDB.findById(req.user!.userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const match = await bcrypt.compare(currentPassword, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Senha atual incorreta.' });

  const hash = await bcrypt.hash(newPassword, 12);
  // Atualizar hash diretamente no SQLite
  const db = (await import('../database/db.js')).default;
  db.prepare('UPDATE users SET password_hash = ?, updated_at = unixepoch() * 1000 WHERE id = ?').run(hash, user.id);

  res.json({ success: true, message: 'Senha alterada com sucesso.' });
});
