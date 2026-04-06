import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '../user/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyRegistrationDto } from './dto/verify-registration.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { USER_EVENTS } from '../kafka/events/user.events';
import { NOTIFICATION_EVENTS } from '../kafka/events/notification.events';
import { randomBytes } from 'crypto';

interface UserServiceProfile {
  fullName?: string | null;
  avatar?: string | null;
  phone?: string | null;
  bio?: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
    private kafkaProducer: KafkaProducerService
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });

    if (existing && existing.isEmailVerified) {
      throw new ConflictException('Email đã được đăng ký');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    if (existing && !existing.isEmailVerified) {
      // Cho phép đăng ký lại với OTP mới khi chưa xác thực
      existing.passwordHash = passwordHash;
      existing.fullName = dto.fullName;
      await this.userRepo.save(existing);
    } else {
      const user = this.userRepo.create({
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        isEmailVerified: false,
      });
      await this.userRepo.save(user);
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redisService.savePendingOtp(dto.email, otp, 900);

    await this.kafkaProducer.emit(NOTIFICATION_EVENTS.SEND_EMAIL, {
      to: dto.email,
      type: 'email_verification',
      data: { fullName: dto.fullName || 'bạn', otp },
    });

    return { message: 'Mã xác thực đã được gửi đến email của bạn' };
  }

  async verifyRegistration(
    dto: VerifyRegistrationDto,
    deviceId?: string
  ): Promise<AuthResponseDto> {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new BadRequestException(
        'Phiên đăng ký đã hết hạn hoặc không tồn tại. Vui lòng đăng ký lại.'
      );
    }
    if (user.isEmailVerified) {
      throw new BadRequestException('Email này đã được xác thực. Vui lòng đăng nhập.');
    }

    const storedOtp = await this.redisService.getPendingOtp(dto.email);
    if (!storedOtp) {
      throw new BadRequestException('Mã OTP đã hết hạn, vui lòng yêu cầu gửi lại');
    }
    if (storedOtp !== dto.otp) {
      throw new BadRequestException('Mã OTP không đúng');
    }

    user.isEmailVerified = true;
    await this.userRepo.save(user);

    await this.redisService.deletePendingOtp(dto.email);

    await this.kafkaProducer.emit(USER_EVENTS.REGISTERED, {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      createdAt: user.createdAt,
    });

    await this.kafkaProducer.emit(NOTIFICATION_EVENTS.SEND_EMAIL, {
      to: user.email,
      type: 'welcome',
      data: { fullName: user.fullName || 'bạn' },
    });

    const finalDeviceId = deviceId || this.generateDeviceId();
    return this.generateTokens(user, finalDeviceId);
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user || user.isEmailVerified) {
      throw new BadRequestException('Không tìm thấy phiên đăng ký. Vui lòng đăng ký lại.');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redisService.savePendingOtp(email, otp, 900);

    await this.kafkaProducer.emit(NOTIFICATION_EVENTS.SEND_EMAIL, {
      to: email,
      type: 'email_verification',
      data: { fullName: user.fullName || 'bạn', otp },
    });

    return { message: 'Mã xác thực mới đã được gửi đến email của bạn' };
  }

  async login(dto: LoginDto, deviceId?: string): Promise<AuthResponseDto> {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Vui lòng xác thực email trước khi đăng nhập');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.');
    }

    const finalDeviceId = deviceId || this.generateDeviceId();
    return this.generateTokens(user, finalDeviceId);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });

    if (!user) {
      throw new BadRequestException('Email không tồn tại trong hệ thống');
    }
    if (!user.isEmailVerified) {
      throw new BadRequestException('Email chưa được xác thực');
    }
    if (!user.isActive) {
      throw new BadRequestException('Tài khoản đã bị khóa');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redisService.saveOtp(user.id, otp, 900);

    await this.kafkaProducer.emit(NOTIFICATION_EVENTS.SEND_EMAIL, {
      to: user.email,
      type: 'password_reset',
      data: { fullName: user.fullName || 'bạn', otp },
    });

    return { message: 'Mã OTP đã được gửi đến email của bạn' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) throw new BadRequestException('Email không tồn tại');

    const storedOtp = await this.redisService.getOtp(user.id);
    if (!storedOtp) throw new BadRequestException('Mã OTP đã hết hạn, vui lòng yêu cầu lại');
    if (storedOtp !== dto.otp) throw new BadRequestException('Mã OTP không đúng');

    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.save(user);
    await this.redisService.deleteOtp(user.id);

    return { message: 'Đặt lại mật khẩu thành công' };
  }

  async refreshToken(
    userId: string,
    deviceId: string,
    refreshToken: string
  ): Promise<AuthResponseDto> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const isValid = await this.redisService.verifyRefreshToken(userId, deviceId, refreshToken);
      if (!isValid) {
        throw new UnauthorizedException('Refresh token đã hết hạn hoặc đã bị thu hồi');
      }

      const user = await this.userRepo.findOne({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException('User không tồn tại');

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

  // ─── Admin Methods ────────────────────────────────────────────────────────────

  async getAllUsers(): Promise<Partial<User>[]> {
    return this.userRepo.find({
      select: ['id', 'email', 'fullName', 'isActive', 'role', 'createdAt'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateUserStatus(id: string, isActive: boolean): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    user.isActive = isActive;
    await this.userRepo.save(user);
    return { message: isActive ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản' };
  }

  async updateUserRole(
    id: string,
    role: UserRole,
    requesterId: string
  ): Promise<{ message: string }> {
    if (id === requesterId) {
      throw new ForbiddenException('Không thể tự thay đổi role của mình');
    }
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    user.role = role;
    await this.userRepo.save(user);
    return { message: `Đã cập nhật role thành ${role}` };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) throw new BadRequestException('Mật khẩu hiện tại không đúng');

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepo.save(user);

    return { message: 'Đổi mật khẩu thành công' };
  }

  async getProfile(
    userId: string,
    authorizationHeader?: string,
    cookieHeader?: string
  ): Promise<Record<string, unknown>> {
    if (!userId) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Người dùng không tồn tại hoặc đã bị khóa');
    }

    const baseProfile = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      avatar: null,
      phone: null,
      bio: null,
    };

    const extendedProfile = await this.fetchUserServiceProfile(
      user.id,
      authorizationHeader,
      cookieHeader
    );

    if (!extendedProfile) {
      return baseProfile;
    }

    return {
      ...baseProfile,
      fullName: extendedProfile.fullName ?? baseProfile.fullName,
      avatar: extendedProfile.avatar ?? null,
      phone: extendedProfile.phone ?? null,
      bio: extendedProfile.bio ?? null,
    };
  }

  private async fetchUserServiceProfile(
    userId: string,
    authorizationHeader?: string,
    cookieHeader?: string
  ): Promise<UserServiceProfile | null> {
    const baseUrls = this.getUserServiceBaseUrls();

    for (const baseUrl of baseUrls) {
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), 2500);

      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (authorizationHeader) headers.Authorization = authorizationHeader;
        if (cookieHeader) headers.Cookie = cookieHeader;

        const response = await fetch(`${baseUrl}/api/users/${userId}`, {
          method: 'GET',
          headers,
          signal: abortController.signal,
        });

        if (response.ok) {
          return (await response.json()) as UserServiceProfile;
        }

        this.logger.warn(
          `Không thể lấy profile mở rộng từ user-service (${baseUrl}), status=${response.status}`
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Gọi user-service thất bại (${baseUrl}) khi lấy profile user ${userId}: ${errorMessage}`
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    return null;
  }

  private getUserServiceBaseUrls(): string[] {
    const configuredUrl = this.configService.get<string>('USER_SERVICE_URL');
    const candidates = [configuredUrl, 'http://user-service:3020', 'http://localhost:3020'];

    return [
      ...new Set(
        candidates
          .filter((url): url is string => Boolean(url))
          .map((url) => url.replace(/\/+$/, ''))
      ),
    ];
  }

  private async generateTokens(user: User, deviceId: string): Promise<AuthResponseDto> {
    const payload = { sub: user.id, email: user.email, deviceId, role: user.role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION'),
    });

    await this.redisService.saveRefreshToken(user.id, deviceId, refreshToken, 7 * 24 * 60 * 60);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
      deviceId,
    };
  }

  private generateDeviceId(): string {
    return randomBytes(16).toString('hex');
  }
}
