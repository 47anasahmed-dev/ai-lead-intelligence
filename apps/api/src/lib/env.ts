import 'dotenv/config';

export const env = {
  port: Number(process.env.API_PORT ?? 3001),
  host: process.env.API_HOST ?? '0.0.0.0',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL ?? '',
  demoUserEmail: process.env.DEMO_USER_EMAIL ?? 'demo@saasquatch.local',
};
