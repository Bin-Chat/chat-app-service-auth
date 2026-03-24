import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class VerifyRegistrationDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'OTP không được để trống' })
  @Length(6, 6, { message: 'OTP phải có đúng 6 chữ số' })
  @Matches(/^\d{6}$/, { message: 'OTP chỉ gồm chữ số' })
  otp: string;
}
