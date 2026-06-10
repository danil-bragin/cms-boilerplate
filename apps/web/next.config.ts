import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  output: 'standalone',
  turbopack: { root: path.join(__dirname, '../..') },
  // Shared ISR/data cache across replicas. In dev the default in-memory
  // handler is fine; in production every replica must point at the same Redis.
  cacheHandler:
    process.env.NODE_ENV === 'production'
      ? require.resolve('@trieb.work/nextjs-turbo-redis-cache')
      : undefined,
  cacheMaxMemorySize: 0,
  transpilePackages: ['@cms/puck-config', '@cms/db', '@cms/contracts', '@cms/auth'],
};

export default config;
