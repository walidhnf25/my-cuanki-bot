export interface ReminderEntity {
  id: string;
  userId: string;
  title: string;
  cronExpression: string;
  nextRunAt: Date | null;
  isActive: boolean;
  lastSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReminderInput {
  userId: string;
  title: string;
  cronExpression: string;
  nextRunAt?: Date | null;
}

export interface UpdateReminderInput {
  title?: string;
  cronExpression?: string;
  nextRunAt?: Date | null;
  isActive?: boolean;
  lastSentAt?: Date | null;
}
