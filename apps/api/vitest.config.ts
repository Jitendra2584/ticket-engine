import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import dotenv from 'dotenv';
import path from 'path';

// Load .env file from apps/api/ so DATABASE_URL and other vars are available in tests
dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  plugins: [
    // SWC plugin enables emitDecoratorMetadata which NestJS DI requires.
    // Vitest's default esbuild transform strips decorator metadata.
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.test.ts',
        'src/main.ts',
        'src/seed/**',
        'src/redis/**',
        'src/pricing/pricing.types.ts',
        'src/events/dto/event-response.dto.ts',
        'src/bookings/dto/booking-response.dto.ts',
      ],
    },
  },
});
