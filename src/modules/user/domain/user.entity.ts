/** Domain representation of an application user (framework/persistence agnostic). */
export interface UserEntity {
  id: string;
  waNumber: string;
  /** Full WhatsApp chat JID for replies/reminders (e.g. `62...@s.whatsapp.net` or `...@lid`). */
  chatJid: string | null;
  displayName: string | null;
  currency: string;
  timezone: string;
  isOnboarded: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  waNumber: string;
  chatJid?: string | null;
  displayName?: string | null;
}

export interface UpdateUserInput {
  chatJid?: string | null;
  displayName?: string | null;
  currency?: string;
  timezone?: string;
  isOnboarded?: boolean;
}
