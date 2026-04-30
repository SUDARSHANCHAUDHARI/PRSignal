import crypto from 'node:crypto';

export function verifyGitHubSignature(rawBody: Buffer, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const actual = Buffer.from(signatureHeader);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function verifySlackSignature(rawBody: Buffer, timestamp: string | undefined, signature: string | undefined, secret: string): boolean {
  if (!timestamp || !signature) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 60 * 5) return false;
  const base = `v0:${timestamp}:${rawBody.toString('utf8')}`;
  const expected = Buffer.from(`v0=${crypto.createHmac('sha256', secret).update(base).digest('hex')}`);
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
