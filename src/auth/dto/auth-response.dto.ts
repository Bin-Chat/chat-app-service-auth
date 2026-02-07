export class AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    phoneNumber: string;
    fullName: string;
  };
  deviceId: string;
}
