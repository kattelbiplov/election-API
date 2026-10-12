import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { UserRole } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string; // user id
  organizationId: string;
  role: UserRole;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: jwt.SignOptions = { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

// Refresh tokens are opaque random strings, not JWTs. We store only a SHA-256
// hash of the token server-side (see RefreshToken model) so a database leak
// does not hand out usable session tokens — mirrors how we treat passwords.
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiryDate(): Date {
  const expires = new Date();
  expires.setDate(expires.getDate() + env.JWT_REFRESH_TTL_DAYS);
  return expires;
}
