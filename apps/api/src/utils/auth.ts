import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signExtensionToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'extension' }, config.JWT_SECRET, {
    expiresIn: `${config.EXTENSION_TOKEN_TTL_DAYS}d`
  });
}

export function verifyExtensionJwt(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as { sub: string; type: string };
    if (decoded.type !== 'extension') return null;
    return { userId: decoded.sub };
  } catch {
    return null;
  }
}
