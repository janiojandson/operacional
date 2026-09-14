import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export interface JwtPayload {
  userId: string;
  email: string;
  role: 'ADMIN' | 'CLIENT';
  clientId?: string;
  name?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não configurado no .env');
  return secret;
}

export function signToken(payload: JwtPayload, expiresIn = '7d'): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn } as any);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret()) as JwtPayload;
}

// ─── Middlewares ──────────────────────────────────────────────────────────

/**
 * Middleware de autenticação: verifica JWT no header Authorization
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de acesso não fornecido.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

/**
 * Middleware: apenas administradores
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
    }
    next();
  });
}

/**
 * Middleware: cliente autenticado OU admin
 * Garante que cliente só acessa seus próprios dados
 */
export function requireClient(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    // Admin pode acessar qualquer coisa
    if (req.user.role === 'ADMIN') return next();
    // Cliente só pode acessar seus próprios dados
    if (req.user.role === 'CLIENT') return next();
    return res.status(403).json({ error: 'Acesso negado.' });
  });
}
