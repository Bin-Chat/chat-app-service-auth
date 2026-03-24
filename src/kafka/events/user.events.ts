export const USER_EVENTS = {
  REGISTERED: 'user.registered',
  PROFILE_UPDATED: 'user.profile_updated',
};

export interface UserRegisteredEvent {
  id: string;
  email: string;
  fullName: string | null;
  createdAt: Date;
}

export interface UserProfileUpdatedEvent {
  id: string;
  fullName: string | null;
  avatar: string | null;
  updatedAt: Date;
}
