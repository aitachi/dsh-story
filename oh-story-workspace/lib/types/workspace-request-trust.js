function header(headers, name) {
    if (headers instanceof Headers)
        return headers.get(name) ?? undefined;
    const value = headers[name];
    return typeof value === 'string' ? value : undefined;
}
function parseAuthority(authority) {
    try {
        return new URL(`http://${authority}`);
    }
    catch {
        return undefined;
    }
}
function canonicalAuthority(entry, url) {
    const port = url.port !== '' ? url.port : new URL(`https://${entry}`).port;
    return port === '' ? url.hostname : `${url.hostname}:${port}`;
}
function isLoopbackHostname(hostname) {
    if (hostname === 'localhost' || hostname === '[::1]')
        return true;
    const parts = hostname.split('.');
    return parts.length === 4
        && parts[0] === '127'
        && parts.every(part => /^\d{1,3}$/u.test(part) && Number(part) <= 255);
}
function isTrustedAuthority(host, trustedHosts) {
    return trustedHosts.some((entry) => {
        const candidate = parseAuthority(entry);
        if (candidate === undefined)
            return false;
        return canonicalAuthority(entry, candidate) === candidate.hostname
            ? candidate.hostname === host.hostname
            : candidate.host === host.host;
    });
}
/** Reject malformed declarations at plugin load instead of silently widening access. */
export function assertTrustedWorkspaceAuthority(entry) {
    const url = parseAuthority(entry);
    if (url !== undefined && canonicalAuthority(entry, url) === entry.toLocaleLowerCase())
        return;
    throw new Error(`oh-story: trustedHosts entry ${JSON.stringify(entry)} is not a bare host[:port] authority`);
}
/**
 * Same browser trust boundary as DSH's native API: every request must address a
 * loopback or explicitly trusted Host, and browser markers must be same-origin.
 */
export function isTrustedWorkspaceRequest(request, trustedHosts) {
    const authority = header(request.headers, 'host');
    if (authority === undefined)
        return false;
    const host = parseAuthority(authority);
    if (host === undefined)
        return false;
    if (!isLoopbackHostname(host.hostname) && !isTrustedAuthority(host, trustedHosts))
        return false;
    if (header(request.headers, 'sec-fetch-site') === 'cross-site')
        return false;
    const origin = header(request.headers, 'origin');
    if (origin === undefined)
        return true;
    try {
        return new URL(origin).host === host.host;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=workspace-request-trust.js.map