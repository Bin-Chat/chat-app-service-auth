export const AUTH_EVENTS = {
  SESSION_KICKED: 'auth.session.kicked',
};

export interface SessionKickedEvent {
  userId: string;
  deviceType: 'mobile' | 'web';
}
