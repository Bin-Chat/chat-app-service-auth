import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS with credentials
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:5173',
      'http://localhost:3000',
    ],
    credentials: true,
  });

  // Cookie parser middleware
  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // No global prefix - Gateway handles /api/auth routing

  const port = process.env.PORT || 3010;
  await app.listen(port);
  console.log(`Auth Service running on port ${port}`);
}
bootstrap();
