import { Controller, Post, Body, UseGuards, Request, Get, Patch, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyRegistrationDto } from './dto/verify-registration.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { UserRole } from '../user/entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-registration')
  async verifyRegistration(
    @Body() dto: VerifyRegistrationDto,
    @Body('deviceId') deviceId: string,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.verifyRegistration(dto, deviceId);
    this.setAuthCookies(res, result.accessToken, result.refreshToken, result.deviceId);
    return {
      user: result.user,
      deviceId: result.deviceId,
      message: 'Đăng ký thành công! Chào mừng đến Bin Chat.',
    };
  }

  @Post('resend-verification')
  async resendVerification(@Body('email') email: string) {
    return this.authService.resendVerification(email);
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Body('deviceId') deviceId: string,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.login(dto, deviceId);
    this.setAuthCookies(res, result.accessToken, result.refreshToken, result.deviceId);
    return {
      user: result.user,
      deviceId: result.deviceId,
      message: 'Đăng nhập thành công',
    };
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  async refresh(@Request() req, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;
    const deviceId = req.cookies.deviceId;
    const refreshToken = req.cookies.refreshToken;

    const result = await this.authService.refreshToken(userId, deviceId, refreshToken);
    this.setAuthCookies(res, result.accessToken, result.refreshToken, result.deviceId);

    return {
      user: result.user,
      message: 'Token đã được làm mới',
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Request() req, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.user.id, req.cookies.deviceId);
    this.clearAuthCookies(res);
    return { message: 'Đăng xuất thành công' };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(@Request() req, @Res({ passthrough: true }) res: Response) {
    await this.authService.logoutAll(req.user.id);
    this.clearAuthCookies(res);
    return { message: 'Đã đăng xuất tất cả thiết bị' };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req) {
    return this.authService.getProfile(
      req.user?.id ?? req.user?.sub,
      req.headers.authorization,
      req.headers.cookie
    );
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(@Request() req, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
  }

  // ─── Admin Endpoints ──────────────────────────────────────────────────────────

  @Get('admin/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getAllUsers() {
    return this.authService.getAllUsers();
  }

  @Patch('admin/users/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateUserStatus(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.authService.updateUserStatus(id, isActive);
  }

  @Patch('admin/users/:id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateUserRole(@Param('id') id: string, @Body('role') role: UserRole, @Request() req) {
    return this.authService.updateUserRole(id, role, req.user.id);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    deviceId: string
  ): void {
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

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
