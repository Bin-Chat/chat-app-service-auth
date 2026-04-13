import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(private configService: ConfigService) {
    this.client = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.client.on('connect', () => {
      console.log('Redis connected successfully');
    });

    this.client.on('error', (error) => {
      console.error('Redis connection error:', error);
    });
  }

  onModuleDestroy() {
    this.client.disconnect();
  }

  /**
   * Lưu refresh token vào Redis
   * @param userId - User ID
   * @param deviceId - Device ID (unique per device)
   * @param refreshToken - Refresh token value
   * @param ttl - Time to live in seconds (default 7 days)
   */
  async saveRefreshToken(
    userId: string,
    deviceId: string,
    refreshToken: string,
    ttl: number = 7 * 24 * 60 * 60 // 7 days
  ): Promise<void> {
    const key = `refresh:${userId}:${deviceId}`;
    await this.client.setex(key, ttl, refreshToken);
  }

  /**
   * Lấy refresh token từ Redis
   * @param userId - User ID
   * @param deviceId - Device ID
   * @returns Refresh token hoặc null nếu không tồn tại
   */
  async getRefreshToken(userId: string, deviceId: string): Promise<string | null> {
    const key = `refresh:${userId}:${deviceId}`;
    return await this.client.get(key);
  }

  /**
   * Kiểm tra refresh token có hợp lệ không
   * @param userId - User ID
   * @param deviceId - Device ID
   * @param refreshToken - Refresh token cần verify
   * @returns true nếu token khớp
   */
  async verifyRefreshToken(
    userId: string,
    deviceId: string,
    refreshToken: string
  ): Promise<boolean> {
    const storedToken = await this.getRefreshToken(userId, deviceId);
    return storedToken === refreshToken;
  }

  /**
   * Xóa refresh token (logout single device)
   * @param userId - User ID
   * @param deviceId - Device ID
   */
  async deleteRefreshToken(userId: string, deviceId: string): Promise<void> {
    const key = `refresh:${userId}:${deviceId}`;
    await this.client.del(key);
  }

  /**
   * Xóa tất cả refresh tokens của user (logout all devices)
   * @param userId - User ID
   */
  async deleteAllRefreshTokens(userId: string): Promise<void> {
    const pattern = `refresh:${userId}:*`;
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  /**
   * Đếm số devices đang active của user
   * @param userId - User ID
   * @returns Số lượng devices
   */
  async countUserDevices(userId: string): Promise<number> {
    const pattern = `refresh:${userId}:*`;
    const keys = await this.client.keys(pattern);
    return keys.length;
  }

  async saveOtp(userId: string, otp: string, ttl: number = 900): Promise<void> {
    const key = `otp:${userId}`;
    await this.client.setex(key, ttl, otp);
  }

  async getOtp(userId: string): Promise<string | null> {
    const key = `otp:${userId}`;
    return await this.client.get(key);
  }

  async deleteOtp(userId: string): Promise<void> {
    const key = `otp:${userId}`;
    await this.client.del(key);
  }

  // ── Per-type Single-Session helpers ──────────────────────────────────────

  /**
   * Lưu active deviceId theo từng loại thiết bị (mobile / web).
   * Mỗi loại chỉ có 1 thiết bị active, login mới sẽ ghi đè thiết bị cũ cùng loại.
   */
  async setActiveDevice(
    userId: string,
    deviceId: string,
    deviceType: 'mobile' | 'web'
  ): Promise<void> {
    await this.client.setex(`session:active:${userId}:${deviceType}`, 30 * 24 * 60 * 60, deviceId);
  }

  async getActiveDevice(userId: string, deviceType: 'mobile' | 'web'): Promise<string | null> {
    return this.client.get(`session:active:${userId}:${deviceType}`);
  }

  async clearActiveDevice(userId: string, deviceType: 'mobile' | 'web'): Promise<void> {
    await this.client.del(`session:active:${userId}:${deviceType}`);
  }

  async clearAllActiveDevices(userId: string): Promise<void> {
    await this.client.del(`session:active:${userId}:mobile`, `session:active:${userId}:web`);
  }

  // ── Device info tracking (for management UI) ──────────────────────────────

  async saveDeviceInfo(
    userId: string,
    deviceId: string,
    info: { deviceType: 'mobile' | 'web'; deviceName?: string; loginAt: string },
    ttl: number = 30 * 24 * 60 * 60
  ): Promise<void> {
    await this.client.setex(`session:device:${userId}:${deviceId}`, ttl, JSON.stringify(info));
  }

  async getDeviceInfo(
    userId: string,
    deviceId: string
  ): Promise<{ deviceType: 'mobile' | 'web'; deviceName?: string; loginAt: string } | null> {
    const raw = await this.client.get(`session:device:${userId}:${deviceId}`);
    return raw ? JSON.parse(raw) : null;
  }

  async clearDeviceInfo(userId: string, deviceId: string): Promise<void> {
    await this.client.del(`session:device:${userId}:${deviceId}`);
  }

  async addDeviceToSet(userId: string, deviceId: string): Promise<void> {
    await this.client.sadd(`session:deviceids:${userId}`, deviceId);
    await this.client.expire(`session:deviceids:${userId}`, 30 * 24 * 60 * 60);
  }

  async removeDeviceFromSet(userId: string, deviceId: string): Promise<void> {
    await this.client.srem(`session:deviceids:${userId}`, deviceId);
  }

  async getAllDeviceIds(userId: string): Promise<string[]> {
    return this.client.smembers(`session:deviceids:${userId}`);
  }

  async clearDeviceSet(userId: string): Promise<void> {
    await this.client.del(`session:deviceids:${userId}`);
  }

  // ── OTP helpers ────────────────────────────────────────────────────────────

  async savePendingOtp(email: string, otp: string, ttl: number = 900): Promise<void> {
    await this.client.setex(`otp:pending:${email}`, ttl, otp);
  }

  async getPendingOtp(email: string): Promise<string | null> {
    return await this.client.get(`otp:pending:${email}`);
  }

  async deletePendingOtp(email: string): Promise<void> {
    await this.client.del(`otp:pending:${email}`);
  }
}
