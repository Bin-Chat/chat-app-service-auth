import { Controller, Post, Body, UseGuards, Request, Get, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';

@Controller()
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Body('deviceId') deviceId: string,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.register(dto, deviceId);

    // Set cookies (HttpOnly, Secure, SameSite)
    this.setAuthCookies(res, result.accessToken, result.refreshToken, result.deviceId);

    // Return only user data (no tokens)
    return {
      user: result.user,
      deviceId: result.deviceId,
      message: 'Đăng ký thành công',
    };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Body('deviceId') deviceId: string,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.login(dto, deviceId);

    // Set cookies
    this.setAuthCookies(res, result.accessToken, result.refreshToken, result.deviceId);

    // Return only user data
    return {
      user: result.user,
      deviceId: result.deviceId,
      message: 'Đăng nhập thành công',
    };
  }

  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  async refresh(@Request() req, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;
    const deviceId = req.cookies.deviceId;
    const refreshToken = req.cookies.refreshToken;

    const result = await this.authService.refreshToken(userId, deviceId, refreshToken);

    // Set new cookies
    this.setAuthCookies(res, result.accessToken, result.refreshToken, result.deviceId);

    return {
      user: result.user,
      message: 'Token đã được làm mới',
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Request() req, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;
    const deviceId = req.cookies.deviceId;

    await this.authService.logout(userId, deviceId);

    // Clear cookies
    this.clearAuthCookies(res);

    return { message: 'Đăng xuất thành công' };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(@Request() req, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;

    await this.authService.logoutAll(userId);

    // Clear cookies
    this.clearAuthCookies(res);

    return { message: 'Đã đăng xuất tất cả thiết bị' };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@Request() req) {
    return req.user;
  }

  // Helper methods
  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    deviceId: string
  ): void {
    const isProduction = process.env.NODE_ENV === 'production';

    // Access Token cookie (15 minutes)
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: '/',
    });

    // Refresh Token cookie (7 days)
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });

    // Device ID cookie (7 days, không cần httpOnly vì frontend có thể đọc)
    res.cookie('deviceId', deviceId, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    res.clearCookie('deviceId', { path: '/' });
  }
}
