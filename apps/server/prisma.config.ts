import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const defaultDatabaseUrl = 'postgresql://ttt:ttt@localhost:5432/ttt';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? defaultDatabaseUrl,
  },
});
