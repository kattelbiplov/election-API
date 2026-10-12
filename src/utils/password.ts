import bcrypt from 'bcryptjs';
import { env } from '../config/env';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Applied at signup/password-change time. Deliberately conservative (length +
// character variety) rather than exotic rules — those just push users toward
// predictable substitutions without adding real entropy.
const PASSWORD_MIN_LENGTH = 10;

export function isPasswordStrongEnough(plain: string): boolean {
  if (plain.length < PASSWORD_MIN_LENGTH) return false;
  const hasLetter = /[a-zA-Z]/.test(plain);
  const hasDigitOrSymbol = /[0-9!@#$%^&*()\-_=+[\]{};:'",.<>/?`~\\|]/.test(plain);
  return hasLetter && hasDigitOrSymbol;
}
