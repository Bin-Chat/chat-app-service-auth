import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global() // Make Redis service available globally
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
