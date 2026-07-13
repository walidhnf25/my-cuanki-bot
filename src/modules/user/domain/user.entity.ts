/** Domain representation of an application user (framework/persistence agnostic). */
export interface UserEntity {
  id: string;
  waNumber: string;
  displayName: string | null;
  currency: string;
  timezone: string;
  isOnboarded: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  waNumber: string;
  displayName?: string | null;
}

export interface UpdateUserInput {
  displayName?: string | null;
  currency?: string;
  timezone?: string;
  isOnboarded?: boolean;
}
