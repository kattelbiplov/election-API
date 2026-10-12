import { User, UserStatus } from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { hashPassword, isPasswordStrongEnough, verifyPassword } from '../../utils/password';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiryDate,
  signAccessToken,
} from '../../utils/jwt';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

interface RequestContext {
  ip?: string;
  userAgent?: string;
}

async function issueTokenPair(user: User, ctx: RequestContext): Promise<TokenPair> {
  const accessToken = signAccessToken({
    sub: user.id,
    organizationId: user.organizationId,
    role: user.role,
  });

  const refreshToken = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiryDate(),
      createdByIp: ctx.ip,
      userAgent: ctx.userAgent,
    },
  });

  return { accessToken, refreshToken, expiresIn: process.env.JWT_ACCESS_TTL ?? '15m' };
}

export async function login(
  email: string,
  password: string,
  ctx: RequestContext,
): Promise<{ user: User; tokens: TokenPair }> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // Same error for "no such user" and "wrong password" — do not leak which
  // one it was, and do not vary response timing observably (bcrypt.compare
  // against a real hash either way avoids a cheap timing oracle).
  const dummyHash = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8lZK6E4jKQ5jjOm4L7yMEfhFA7vE7q';
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? dummyHash);

  if (!user || !passwordOk) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.status !== UserStatus.ACTIVE) {
    throw ApiError.forbidden('This account is not active. Contact your campaign admin.');
  }

  const tokens = await issueTokenPair(user, ctx);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return { user, tokens };
}

export async function refresh(rawToken: string, ctx: RequestContext): Promise<TokenPair> {
  const tokenHash = hashRefreshToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
    throw ApiError.unauthorized('Refresh token is invalid or expired');
  }

  if (existing.user.status !== UserStatus.ACTIVE) {
    throw ApiError.forbidden('This account is not active. Contact your campaign admin.');
  }

  // Rotate: revoke the presented token and issue a brand new pair. Prevents
  // indefinite reuse of a single refresh token and lets us detect replay
  // (a revoked token being presented again indicates possible token theft).
  const tokens = await issueTokenPair(existing.user, ctx);
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), replacedByTokenHash: hashRefreshToken(tokens.refreshToken) },
  });

  return tokens;
}

export async function logout(rawToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAllSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const isCorrect = await verifyPassword(currentPassword, user.passwordHash);
  if (!isCorrect) {
    throw ApiError.badRequest('Current password is incorrect');
  }

  if (!isPasswordStrongEnough(newPassword)) {
    throw ApiError.badRequest(
      'New password must be at least 10 characters and include a letter and a number or symbol',
    );
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  // Changing your password invalidates every other session — standard
  // defense against a stolen refresh token outliving a credential change.
  await logoutAllSessions(userId);
}

export async function getCurrentUser(userId: string): Promise<User> {
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}
