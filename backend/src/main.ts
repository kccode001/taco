import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

// Origins always allowed, in any environment.
const STATIC_ALLOWED_ORIGINS = [
  'http://localhost:4014',
  'http://localhost:3000',
];

// Dev-only: allow the FE (port 4014) served from a LAN IP, so phones/tablets on
// the same network can reach the backend. Kept out of production to avoid
// loosening posture there.
const DEV_LAN_ORIGIN =
  /^http:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)[\d.]*:4014$/;

function isAllowedOrigin(origin: string): boolean {
  if (STATIC_ALLOWED_ORIGINS.includes(origin)) return true;
  if (process.env.NODE_ENV !== 'production' && DEV_LAN_ORIGIN.test(origin))
    return true;
  return false;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Non-browser clients (curl, server-to-server) send no Origin header — allow them.
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  });

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 5013;
  await app.listen(port);
  console.log(`TACO Backend running on port ${port}`);
}
bootstrap();
