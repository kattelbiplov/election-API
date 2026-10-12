import { User } from '@prisma/client';

// Never send passwordHash (or other internal-only fields) to the client.
// Every controller that returns a User must go through this.
export function toPublicUser(user: User) {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}
