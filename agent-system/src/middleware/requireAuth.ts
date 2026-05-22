// Middleware: verifica JWT antes de procesar requests al agent.
// Rechaza con 401 si el token falta, está expirado o la firma no es válida.
// Usa el mismo secret HS256 que el backend FastAPI.

import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const JWT_SECRET =
  process.env.BACKEND_JWT_SECRET ||
  process.env.SECRET_KEY_JWT ||
  process.env.SECRET_KEY ||
  'changeme-super-secret-key';

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'access_token';

// Skip auth entirely in local dev when explicitly disabled.
const SKIP_AUTH = process.env.AGENT_SKIP_AUTH === 'true';

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  const padded2 = pad ? padded + '='.repeat(4 - pad) : padded;
  return Buffer.from(padded2, 'base64').toString('utf8');
}

function verifyHs256Jwt(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSig] = parts;
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(unsignedToken)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // Constant-time comparison to prevent timing attacks.
  if (
    encodedSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(Buffer.from(encodedSig), Buffer.from(expectedSig))
  ) {
    return null;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return null;
  }

  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  if (exp !== null && Math.floor(Date.now() / 1000) > exp) {
    return null;
  }

  return payload;
}

function extractToken(req: Request): string | null {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // 2. HttpOnly cookie (same name as FastAPI backend).
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
    if (match) {
      return match.slice(AUTH_COOKIE_NAME.length + 1).trim();
    }
  }

  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (SKIP_AUTH) {
    next();
    return;
  }

  const token = extractToken(req);
  if (!token) {
    logger.warn('requireAuth: no token', { path: req.path, method: req.method });
    res.status(401).json({ success: false, error: 'Autenticación requerida.' });
    return;
  }

  const payload = verifyHs256Jwt(token, JWT_SECRET);
  if (!payload) {
    logger.warn('requireAuth: token inválido o expirado', { path: req.path });
    res.status(401).json({ success: false, error: 'Token inválido o expirado.' });
    return;
  }

  next();
}
