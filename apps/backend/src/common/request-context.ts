import { Request } from 'express';

export type RequestWithContext = Request & { requestId?: string };

export function anonymizeIp(ip?: string) {
  if (!ip) return undefined;
  if (ip.includes(':')) return `${ip.split(':').slice(0, 4).join(':')}::/64`;
  const parts = ip.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : undefined;
}

export function requestMetadata(request: RequestWithContext) {
  return {
    ipAddress: anonymizeIp(request.ip),
    userAgent: request.get('user-agent')?.slice(0, 500),
    requestId: request.requestId,
  };
}
