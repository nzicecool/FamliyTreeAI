type Environment = Record<string, string | undefined>;

// Never fall back to development credentials in a production build/server.
export function clerkKeyNames(production: boolean) {
  return {
    publishable: production ? 'VITE_CLERK_PUBLISHABLE_KEY_PROD' : 'VITE_CLERK_PUBLISHABLE_KEY',
    secret: production ? 'CLERK_SECRET_KEY_PROD' : 'CLERK_SECRET_KEY',
  };
}

export function requireClerkKey(env: Environment, production: boolean, kind: 'publishable' | 'secret') {
  const name = clerkKeyNames(production)[kind];
  const value = env[name]?.trim();
  const prefix = `${kind === 'publishable' ? 'pk' : 'sk'}_${production ? 'live' : 'test'}_`;
  if (!value || !value.startsWith(prefix)) {
    throw new Error(`Set ${name} to a Clerk ${production ? 'production' : 'development'} ${kind} key starting with ${prefix}.`);
  }
  return value;
}
