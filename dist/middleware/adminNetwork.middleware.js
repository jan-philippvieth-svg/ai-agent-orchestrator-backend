import { config } from '../config.js';
export async function adminNetworkGuard(request, reply) {
    if (!request.url.startsWith('/admin'))
        return;
    if (!config.admin.allowPrivateNetworksOnly && config.admin.allowedIps.length === 0)
        return;
    const remoteAddress = normalizeIp(request.ip);
    const forwardedFor = request.headers['x-forwarded-for'];
    const forwardedIp = typeof forwardedFor === 'string' ? normalizeIp(forwardedFor.split(',')[0]?.trim() ?? '') : undefined;
    const candidateIps = [remoteAddress, forwardedIp].filter(Boolean);
    const explicitlyAllowed = candidateIps.some((ip) => config.admin.allowedIps.includes(ip));
    const privateAllowed = config.admin.allowPrivateNetworksOnly && candidateIps.some((ip) => isLocalOrPrivateNetwork(ip));
    if (!explicitlyAllowed && !privateAllowed) {
        await reply.code(403).send({
            success: false,
            error: 'Forbidden',
            message: 'Admin endpoint is restricted to configured internal networks.',
        });
    }
}
function normalizeIp(value) {
    return value.replace(/^::ffff:/, '');
}
function isLocalOrPrivateNetwork(ip) {
    return (ip === '127.0.0.1' ||
        ip === '::1' ||
        ip.startsWith('10.') ||
        ip.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
        /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip));
}
