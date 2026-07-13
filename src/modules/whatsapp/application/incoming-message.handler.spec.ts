import { AuditLogRepository } from 'src/modules/audit/domain/audit-log.repository';
import { CreateUserInput, UserEntity } from 'src/modules/user/domain/user.entity';
import { UserRepository } from 'src/modules/user/domain/user.repository';
import {
  ConnectionStatus,
  IncomingMessage,
  IncomingMessageHandler as GatewayHandler,
  MessagingGateway,
} from '../domain/messaging.gateway.port';
import { IncomingMessageHandler } from './incoming-message.handler';
import { MessageDedupeService } from './message-dedupe.service';
import { MessageOrchestrator } from './message-orchestrator';
import { ReplyBuilder } from './reply-builder';

class FakeGateway extends MessagingGateway {
  sent: Array<{ to: string; text: string }> = [];
  onMessage(_handler: GatewayHandler): void {}
  sendText(to: string, text: string): Promise<void> {
    this.sent.push({ to, text });
    return Promise.resolve();
  }
  sendDocument(): Promise<void> {
    return Promise.resolve();
  }
  getStatus(): ConnectionStatus {
    return 'connected';
  }
  isConnected(): boolean {
    return true;
  }
}

class StubUserRepository extends UserRepository {
  private readonly known = new Map<string, UserEntity>();
  findById(): Promise<UserEntity | null> {
    return Promise.resolve(null);
  }
  findByWaNumber(waNumber: string): Promise<UserEntity | null> {
    return Promise.resolve(this.known.get(waNumber) ?? null);
  }
  findOrCreate(input: CreateUserInput): Promise<{ user: UserEntity; created: boolean }> {
    const existing = this.known.get(input.waNumber);
    if (existing) return Promise.resolve({ user: existing, created: false });
    const user: UserEntity = {
      id: `id-${input.waNumber}`,
      waNumber: input.waNumber,
      displayName: input.displayName ?? null,
      currency: 'IDR',
      timezone: 'Asia/Jakarta',
      isOnboarded: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.known.set(input.waNumber, user);
    return Promise.resolve({ user, created: true });
  }
  update(): Promise<UserEntity> {
    throw new Error('not used');
  }
}

class StubAuditRepository extends AuditLogRepository {
  actions: string[] = [];
  record(input: { action: string }): Promise<void> {
    this.actions.push(input.action);
    return Promise.resolve();
  }
  findForUser(): Promise<never[]> {
    return Promise.resolve([]);
  }
}

function msg(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    waMessageId: `m-${Math.round(Math.random() * 1e9)}`,
    from: '628123',
    chatJid: '628123@s.whatsapp.net',
    text: 'beli kopi 25rb',
    pushName: 'Budi',
    timestamp: new Date('2026-07-15T03:00:00.000Z'),
    ...overrides,
  };
}

describe('IncomingMessageHandler', () => {
  let gateway: FakeGateway;
  let users: StubUserRepository;
  let audit: StubAuditRepository;
  let orchestrator: { process: jest.Mock };
  let handler: IncomingMessageHandler;

  beforeEach(() => {
    gateway = new FakeGateway();
    users = new StubUserRepository();
    audit = new StubAuditRepository();
    orchestrator = { process: jest.fn().mockResolvedValue({ text: 'ROUTED_REPLY' }) };
    handler = new IncomingMessageHandler(
      gateway,
      users,
      audit,
      new MessageDedupeService(),
      new ReplyBuilder(),
      orchestrator as unknown as MessageOrchestrator,
    );
  });

  it('onboards a new user and sends the orchestrated reply', async () => {
    await handler.handle(msg({ waMessageId: 'm1' }));
    expect(gateway.sent).toHaveLength(2);
    expect(gateway.sent[0].text).toContain('Selamat datang');
    expect(gateway.sent[1].text).toBe('ROUTED_REPLY');
    expect(audit.actions).toEqual(['MESSAGE_IN', 'MESSAGE_OUT']);
  });

  it('sends nothing (and no MESSAGE_OUT) when the orchestrator returns empty', async () => {
    orchestrator.process.mockResolvedValue({});
    await handler.handle(msg({ waMessageId: 'm1', text: 'halo' }));
    expect(gateway.sent).toHaveLength(1); // onboarding only
    expect(audit.actions).toEqual(['MESSAGE_IN']);
  });

  it('ignores duplicate message ids', async () => {
    await handler.handle(msg({ waMessageId: 'dup' }));
    const count = gateway.sent.length;
    await handler.handle(msg({ waMessageId: 'dup' }));
    expect(gateway.sent.length).toBe(count);
  });
});
