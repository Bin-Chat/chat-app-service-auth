export const NOTIFICATION_EVENTS = {
  SEND_EMAIL: 'notification.email',
};

export interface SendEmailEvent {
  to: string;
  type: 'welcome' | 'password_reset' | 'email_verification';
  data: {
    fullName?: string;
    otp?: string;
  };
}
