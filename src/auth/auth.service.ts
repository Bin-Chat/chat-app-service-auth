import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../user/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService
  ) {}

  async register(dto: RegisterDto, deviceId?: string): Promise<AuthResponseDto> {
    const existing = await this.userRepo.findOne({ where: { phoneNumber: dto.phoneNumber } });
    if (existing) throw new ConflictException('Số điện thoại đã được đăng ký');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({ ...dto, passwordHash });
    await this.userRepo.save(user);

    // Generate deviceId if not provided
    const finalDeviceId = deviceId || this.generateDeviceId();
    return this.generateTokens(user, finalDeviceId);
  }

  async login(dto: LoginDto, deviceId?: string): Promise<AuthResponseDto> {
    const user = await this.userRepo.findOne({ where: { phoneNumber: dto.phoneNumber } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Số điện thoại hoặc mật khẩu không đúng');
    }

    // Generate deviceId if not provided
    const finalDeviceId = deviceId || this.generateDeviceId();
    return this.generateTokens(user, finalDeviceId);
  }

  async refreshToken(
    userId: string,
    deviceId: string,
    refreshToken: string
  ): Promise<AuthResponseDto> {
    try {
      // 1. Verify JWT signature
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      // 2. Check if token exists in Redis
      const isValid = await this.redisService.verifyRefreshToken(userId, deviceId, refreshToken);

      if (!isValid) {
        throw new UnauthorizedException('Refresh token đã hết hạn hoặc đã bị thu hồi');
      }

      // 3. Get user
      const user = await this.userRepo.findOne({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException('User không tồn tại');

      // 4. Generate new tokens with same deviceId
      return this.generateTokens(user, deviceId);
    } catch (error) {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
  }

  async logout(userId: string, deviceId: string): Promise<void> {
    await this.redisService.deleteRefreshToken(userId, deviceId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.redisService.deleteAllRefreshTokens(userId);
  }

  private async generateTokens(user: User, deviceId: string): Promise<AuthResponseDto> {
    const payload = { sub: user.id, phone: user.phoneNumber, deviceId };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION'),
    });

    // Save refresh token to Redis (7 days TTL)
    await this.redisService.saveRefreshToken(
      user.id,
      deviceId,
      refreshToken,
      7 * 24 * 60 * 60 // 7 days in seconds
    );

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, phoneNumber: user.phoneNumber, fullName: user.fullName },
      deviceId,
    };
  }

  private generateDeviceId(): string {
    return randomBytes(16).toString('hex');
  }
}
