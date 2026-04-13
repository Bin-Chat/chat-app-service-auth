import { IsNotEmpty, IsEmail, IsOptional, IsIn } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email: string;

  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  password: string;

  @IsOptional()
  @IsIn(['mobile', 'web'], { message: 'deviceType phải là mobile hoặc web' })
  deviceType?: 'mobile' | 'web';

  @IsOptional()
  deviceName?: string;
}
