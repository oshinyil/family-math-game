import { networkInterfaces } from 'node:os';
import { isIP } from 'node:net';

export function normalizeAddress(address = '') {
  return address.replace(/^::ffff:/, '');
}

export function isLoopback(address) {
  address = normalizeAddress(address);
  return address === '::1' || (isIP(address) === 4 && address.startsWith('127.'));
}

export function isPrivate(address) {
  address = normalizeAddress(address);
  if (isLoopback(address)) return true;
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function allowedRequest(req) {
  if (!isPrivate(req.socket.remoteAddress)) return false;
  try {
    const host = new URL(`http://${req.headers.host}`);
    const hostname = host.hostname.replace(/^\[|\]$/g, '');
    if (hostname !== 'localhost' && !isPrivate(hostname)) return false;
    if (req.headers.origin && new URL(req.headers.origin).origin !== host.origin) return false;
    return true;
  } catch {
    return false;
  }
}

export function joinUrls(port) {
  const adapters = Object.entries(networkInterfaces())
    .sort(([a], [b]) => Number(/virtual|vethernet|vpn|docker|wsl|vmware|tailscale|zerotier/i.test(a)) -
      Number(/virtual|vethernet|vpn|docker|wsl|vmware|tailscale|zerotier/i.test(b)));
  return [...new Set(adapters.flatMap(([, addresses]) => addresses ?? [])
    .filter(info => info.family === 'IPv4' && !info.internal && isPrivate(info.address))
    .map(info => `http://${info.address}:${port}`))];
}
