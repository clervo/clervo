function invalid() { throw new Error('database URL is invalid'); }

export function normalizeProductionDatabaseUrl(raw, environment = process.env) {
  if (!raw) invalid();
  const proxyHost = environment.CLERVO_MIGRATION_PROXY_HOST;
  const socketForm = /^(postgresql:\/\/[^@]+)@\/([^?]+)\?(.+)$/u.exec(raw);
  try {
    let parsed;
    if (socketForm) {
      parsed = new URL(`${socketForm[1]}@localhost/${socketForm[2]}`);
      if (!proxyHost) {
        const socket = new URLSearchParams(socketForm[3]).get('host');
        const connection = environment.CLERVO_CLOUD_SQL_CONNECTION;
        if (!connection || socket !== `/cloudsql/${connection}`) invalid();
        parsed.searchParams.set('host', socket);
      }
    } else parsed = new URL(raw);
    if (parsed.protocol !== 'postgresql:' || decodeURIComponent(parsed.pathname) !== '/clervo') invalid();
    if (proxyHost) {
      if (!['127.0.0.1', '::1', 'localhost'].includes(proxyHost)) invalid();
      parsed.hostname = proxyHost;
      parsed.port = environment.CLERVO_MIGRATION_PROXY_PORT ?? '5432';
      parsed.search = '';
    }
    return parsed.toString();
  } catch {
    invalid();
  }
}
