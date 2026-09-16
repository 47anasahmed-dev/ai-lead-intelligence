import type { NextConfig } from 'next';

/** Public Oracle API for Vercel builds; local default stays localhost. */
const defaultApiUrl =
  process.env.VERCEL === '1'
    ? 'https://ali-api.84.13.132.185.sslip.io'
    : 'http://localhost:3001';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? defaultApiUrl,
  },
};

export default nextConfig;
