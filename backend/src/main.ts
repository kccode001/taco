import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.enableCors({
    origin: ['http://localhost:4014', 'http://localhost:3000'],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 5013;
  await app.listen(port);
  console.log(`TACO Backend running on port ${port}`);
}
bootstrap();
