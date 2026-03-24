import { UserRole } from '../../user/entities/user.entity';

export class AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
  };
  deviceId: string;
}
