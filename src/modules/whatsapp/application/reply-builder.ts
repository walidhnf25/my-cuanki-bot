import { Injectable } from '@nestjs/common';
import { IntentType, ParsedIntent } from 'src/modules/parser/domain/parsed-intent';
import { TransactionResult } from 'src/modules/transaction/application/transaction.service';
import { TransactionType } from 'src/shared/domain/enums';
import { formatDate } from 'src/shared/utils/date.util';

/**
 * Builds the Indonesian text the bot replies with. In Phase 6 the transport +
 * routing are live; feature actions (recording, summaries, budgets, ...) are
 * acknowledged and wired up in Phases 7–10. Replies here are intentionally
 * honest about what is/ isn't persisted yet.
 */
@Injectable()
export class ReplyBuilder {
  onboarding(name?: string | null): string {
    const greeting = name ? `Halo ${name}! 👋` : 'Halo! 👋';
    return [
      `${greeting} Selamat datang di *Finance Bot* 🤖💰`,
      '',
      'Catat keuangan cukup lewat chat. Contoh:',
      '• _beli kopi 25rb_',
      '• _gaji 8 juta_',
      '• _isi bensin 100rb_',
      '• _ringkasan bulan ini_',
      '• _budget makan 2 juta_',
      '',
      'Ketik *help* kapan saja untuk melihat menu.',
    ].join('\n');
  }

  compose(intent: ParsedIntent): string {
    switch (intent.type) {
      case IntentType.Help:
        return this.help();

      case IntentType.Greeting:
        return 'Halo! 👋 Ada yang ingin dicatat? Ketik *help* untuk contoh.';

      case IntentType.RecordTransaction: {
        if (intent.amount === null) {
          return '💰 Berapa harganya?';
        }
        const label =
          intent.transactionType === TransactionType.INCOME ? 'Pemasukan' : 'Pengeluaran';
        const desc = intent.description || 'transaksi';
        return [
          `📝 Dimengerti: *${label}* ${intent.amount.format()} — "${desc}".`,
          '',
          '⚙️ Pencatatan otomatis diaktifkan pada tahap berikutnya.',
        ].join('\n');
      }

      case IntentType.AmountOnly:
        return `Oke, ${intent.amount.format()} diterima. (Butuh konteks percakapan — aktif di tahap berikutnya.)`;

      case IntentType.Summary:
        return '📊 Ringkasan akan aktif pada tahap berikutnya.';

      case IntentType.SetBudget:
        return '🎯 Pengaturan budget akan aktif pada tahap berikutnya.';

      case IntentType.EditTransaction:
        return '✏️ Edit transaksi akan aktif pada tahap berikutnya.';

      case IntentType.DeleteTransaction:
        return '🗑️ Hapus transaksi akan aktif pada tahap berikutnya.';

      case IntentType.SetReminder:
        return '⏰ Pengingat akan aktif pada tahap berikutnya.';

      case IntentType.Export:
        return '📁 Export CSV akan aktif pada tahap berikutnya.';

      case IntentType.Unknown:
      default:
        return 'Maaf, saya belum paham 🙏. Ketik *help* untuk melihat contoh perintah.';
    }
  }

  askAmount(): string {
    return '💰 Berapa harganya?';
  }

  recorded(result: TransactionResult, timezone: string): string {
    const { transaction: t, category } = result;
    const label = t.type === TransactionType.INCOME ? 'Pemasukan' : 'Pengeluaran';
    return [
      '✅ Berhasil dicatat!',
      '',
      `${label}: *${t.amount.format()}*`,
      `📂 ${this.categoryLabel(category?.name, category?.icon)}`,
      `📝 ${t.description}`,
      `📅 ${formatDate(t.occurredAt, timezone)}`,
    ].join('\n');
  }

  edited(result: TransactionResult, timezone: string): string {
    const { transaction: t, category } = result;
    const label = t.type === TransactionType.INCOME ? 'Pemasukan' : 'Pengeluaran';
    return [
      '✏️ Transaksi diperbarui.',
      '',
      `${label}: *${t.amount.format()}*`,
      `📂 ${this.categoryLabel(category?.name, category?.icon)}`,
      `📅 ${formatDate(t.occurredAt, timezone)}`,
    ].join('\n');
  }

  deleted(result: TransactionResult): string {
    const { transaction: t } = result;
    const label = t.type === TransactionType.INCOME ? 'Pemasukan' : 'Pengeluaran';
    return `🗑️ Transaksi dihapus: ${label} ${t.amount.format()} — "${t.description}".`;
  }

  nothingToEdit(): string {
    return 'Belum ada transaksi yang bisa diedit. 🙂';
  }

  nothingToDelete(): string {
    return 'Belum ada transaksi yang bisa dihapus. 🙂';
  }

  private categoryLabel(name?: string | null, icon?: string | null): string {
    const label = name ?? 'Lainnya';
    return icon ? `${icon} ${label}` : label;
  }

  private help(): string {
    return [
      '*📖 Menu Finance Bot*',
      '',
      '*Catat pengeluaran:*',
      '• _beli kopi 25rb_',
      '• _isi bensin 100rb_',
      '',
      '*Catat pemasukan:*',
      '• _gaji 8 juta_',
      '• _dapat bonus 500rb_',
      '',
      '*Laporan & lainnya:*',
      '• _ringkasan hari ini / minggu ini / bulan ini_',
      '• _budget makan 2 juta_',
      '• _hapus_ (transaksi terakhir)',
      '• _export bulan ini_',
    ].join('\n');
  }
}
