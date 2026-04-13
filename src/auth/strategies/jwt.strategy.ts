import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { RedisService } from '../../redis/redis.service';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private redisService: RedisService,
    configService: ConfigService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // 1. Try cookie first
        (request: Request) => {
          return request?.cookies?.accessToken || null;
        },
        // 2. Fallback to Authorization header (for backward compatibility)
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive)
      throw new UnauthorizedException('Người dùng không tồn tại hoặc đã bị khóa');

    // Per-type single session — kiểm tra thiết bị đang active cho loại này
    const deviceType: 'mobile' | 'web' = payload.deviceType ?? 'web';
    const activeDevice = await this.redisService.getActiveDevice(user.id, deviceType);
    if (activeDevice && activeDevice !== payload.deviceId) {
      throw new UnauthorizedException(
        'Phiên đăng nhập đã hết hạn vì tài khoản vừa đăng nhập ở thiết bị khác. Vui lòng đăng nhập lại.'
      );
    }

    return user;
  }
}
