import { Injectable } from '@nestjs/common';
import { SetBudgetResult } from 'src/modules/budget/application/budget.service';
import { BudgetAlert } from 'src/modules/budget/domain/budget-alert';
import { IntentType, ParsedIntent } from 'src/modules/parser/domain/parsed-intent';
import { SummaryResult } from 'src/modules/report/domain/summary.types';
import { TransactionResult } from 'src/modules/transaction/application/transaction.service';
import { WalletOverview } from 'src/modules/wallet/application/wallet.service';
import { TransferEntity } from 'src/modules/wallet/domain/transfer.entity';
import { BudgetPeriod, TransactionType, Wallet, WalletMode } from 'src/shared/domain/enums';
import { formatDate } from 'src/shared/utils/date.util';
import { Money } from 'src/shared/utils/money';

const BUDGET_PERIOD_WORD: Record<BudgetPeriod, string> = {
  [BudgetPeriod.DAILY]: 'harian',
  [BudgetPeriod.WEEKLY]: 'mingguan',
  [BudgetPeriod.MONTHLY]: 'bulanan',
};

const WALLET_LABEL: Record<Wallet, string> = {
  [Wallet.CASH]: '💵 Cash',
  [Wallet.DIGITAL]: '📱 Digital',
};

/**
 * Builds the Indonesian text the bot replies with. Feature replies (record,
 * summary, budget, ...) are produced from application-service results.
 */
@Injectable()
export class ReplyBuilder {
  onboarding(name?: string | null): string {
    const greeting = name ? `Halo ${name}! 👋` : 'Halo! 👋';
    return [
      `${greeting} Selamat datang di *Cuanki* 🤖💰`,
      '',
      'Catat keuangan cukup lewat chat. Contoh:',
      '• _beli kopi 25rb_',
      '• _gaji 8 juta_',
      '• _ringkasan bulan ini_',
      '• _budget makan 2 juta_',
      '',
      'Ketik *help* kapan saja untuk melihat menu lengkap.',
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

      case IntentType.Export:
        return '📁 Export Excel akan aktif pada tahap berikutnya.';

      case IntentType.Unknown:
      default:
        return 'Maaf, saya belum paham 🙏. Ketik *help* untuk melihat contoh perintah.';
    }
  }

  askWallet(description: string, amount: Money): string {
    const what = description ? ` *${description}*` : '';
    return [
      `👛 Pakai dompet apa untuk${what} ${amount.format()}?`,
      '',
      'Balas *cash* atau *digital*.',
      '_Tip: atur default dengan_ default digital',
    ].join('\n');
  }

  askWalletRetry(): string {
    return 'Balas *cash* atau *digital* ya. 🙂 Ketik *batal* untuk membatalkan.';
  }

  askAmount(description?: string): string {
    return description ? `💰 Berapa harga *${description}*?` : '💰 Berapa harganya?';
  }

  deleteConfirm(result: TransactionResult): string {
    const { transaction: t } = result;
    const label = t.type === TransactionType.INCOME ? 'Pemasukan' : 'Pengeluaran';
    return [
      `🗑️ Hapus transaksi terakhir?`,
      `${label} ${t.amount.format()} — "${t.description}"`,
      '',
      'Ketik *ya* untuk hapus, *tidak* untuk batal.',
    ].join('\n');
  }

  deleteConfirmRetry(): string {
    return 'Ketik *ya* untuk menghapus, atau *tidak* untuk membatalkan. 🙂';
  }

  cancelled(): string {
    return 'Oke, dibatalkan. 👍';
  }

  recorded(result: TransactionResult, timezone: string): string {
    const { transaction: t, category } = result;
    const label = t.type === TransactionType.INCOME ? 'Pemasukan' : 'Pengeluaran';
    return [
      '✅ Berhasil dicatat!',
      '',
      `${label}: *${t.amount.format()}*`,
      `📂 ${this.categoryLabel(category?.name, category?.icon)}`,
      ...(t.wallet ? [`👛 ${WALLET_LABEL[t.wallet]}`] : []),
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
      ...(t.wallet ? [`👛 ${WALLET_LABEL[t.wallet]}`] : []),
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

  summary(result: SummaryResult, wallets?: WalletOverview): string {
    const lines = [
      `📊 *Ringkasan ${result.periodLabel}*`,
      '',
      `💰 Pemasukan: ${result.income.format()}`,
      `💸 Pengeluaran: ${result.expense.format()}`,
      // With wallets, "Saldo" would clash with the all-time wallet balances below.
      wallets?.enabled
        ? `💵 Selisih periode: ${result.balance.format()}`
        : `💵 Saldo: ${result.balance.format()}`,
    ];

    // Two wallets: category breakdown is split per wallet. One wallet: the normal list
    // plus that wallet's balance.
    const split = wallets !== undefined && wallets.enabled && wallets.lines.length > 1;
    const single = wallets !== undefined && wallets.enabled && wallets.lines.length === 1;

    if (split) {
      // Wallet users get the category breakdown split per wallet instead of one list.
      lines.push('', '👛 *Per dompet:*', `💰 Total saldo dompet: *${wallets.total.format()}*`);
      for (const l of wallets.lines) {
        // awal periode + masuk - keluar + transfer = saldo, so the numbers can be checked.
        lines.push(
          '',
          `*${WALLET_LABEL[l.wallet]}*`,
          `🏁 Awal periode: ${l.startBalance.format()}`,
          `⬆️ Masuk: ${l.income.format()}`,
          `⬇️ Keluar: ${l.expense.format()}`,
        );
        if (!l.transferIn.isZero() || !l.transferOut.isZero()) {
          lines.push(
            `🔁 Transfer: masuk ${l.transferIn.format()} · keluar ${l.transferOut.format()}`,
          );
        }
        lines.push(`💰 Saldo: *${l.balance.format()}*`);
        if (l.categories.length > 0) {
          lines.push('📂 Pengeluaran per kategori:');
          for (const c of l.categories) {
            lines.push(`${c.icon} ${c.name}: ${c.total.format()}`);
          }
        }
      }
    } else if (result.categories.length > 0) {
      lines.push('', '📂 *Pengeluaran per kategori:*');
      for (const c of result.categories) {
        lines.push(`${c.icon} ${c.name}: ${c.total.format()}`);
      }
    } else {
      lines.push('', '_Belum ada pengeluaran pada periode ini._');
    }

    if (single) {
      const only = wallets.lines[0];
      lines.push('', `👛 Saldo ${WALLET_LABEL[only.wallet]}: *${only.balance.format()}*`);
    }

    return lines.join('\n');
  }

  balance(overview: WalletOverview): string {
    const lines = [
      '👛 *Saldo Dompet*',
      '',
      ...overview.lines.map((l) => `${WALLET_LABEL[l.wallet]}: ${l.balance.format()}`),
      `💰 Total: *${overview.total.format()}*`,
    ];
    if (!overview.enabled) {
      lines.push('', '_Atur saldo awal: saldo awal cash 200rb_');
    }
    return lines.join('\n');
  }

  transferRecorded(t: TransferEntity, overview: WalletOverview): string {
    return [
      '🔁 *Transfer dicatat!*',
      `${WALLET_LABEL[t.from]} → ${WALLET_LABEL[t.to]}: *${t.amount.format()}*`,
      '',
      '*Saldo sekarang:*',
      ...overview.lines.map((l) => `${WALLET_LABEL[l.wallet]}: ${l.balance.format()}`),
    ].join('\n');
  }

  deleteTransferConfirm(t: TransferEntity): string {
    return [
      '🗑️ Hapus transfer terakhir?',
      `${WALLET_LABEL[t.from]} → ${WALLET_LABEL[t.to]}: ${t.amount.format()}`,
      '',
      'Ketik *ya* untuk hapus, *tidak* untuk batal.',
    ].join('\n');
  }

  transferDeleted(t: TransferEntity): string {
    return `🗑️ Transfer dihapus: ${WALLET_LABEL[t.from]} → ${WALLET_LABEL[t.to]} ${t.amount.format()}.`;
  }

  nothingToDeleteTransfer(): string {
    return 'Belum ada transfer yang bisa dihapus. 🙂';
  }

  askTransferAmount(): string {
    return 'Sebutkan nominalnya. Contoh: _tarik tunai 500rb_ atau _pindah 300rb dari cash ke digital_';
  }

  askTransferDirection(): string {
    return 'Sebutkan arahnya. Contoh: _pindah 500rb dari digital ke cash_';
  }

  askWalletMode(): string {
    return [
      '👛 *Mau pakai dompet yang mana?*',
      '',
      '1️⃣ Cash saja',
      '2️⃣ Digital saja (transfer, QRIS, e-wallet)',
      '3️⃣ Cash dan Digital',
      '',
      'Balas *1*, *2*, atau *3*. Bisa diubah lagi dengan _atur dompet_.',
    ].join('\n');
  }

  walletModeRetry(): string {
    return 'Balas *1* (Cash), *2* (Digital), atau *3* (keduanya). Ketik *batal* untuk membatalkan. 🙂';
  }

  walletModeSet(mode: WalletMode): string {
    if (mode === WalletMode.BOTH) {
      return [
        '✅ Dompet diatur: *Cash dan Digital*.',
        'Sebut dompet di pesan (_beli kopi 25rb cash_), atau bot akan bertanya.',
      ].join('\n');
    }
    const wallet = mode === WalletMode.CASH ? Wallet.CASH : Wallet.DIGITAL;
    return [
      `✅ Dompet diatur: *${wallet === Wallet.CASH ? 'Cash' : 'Digital'} saja*.`,
      `Semua transaksi masuk ke ${WALLET_LABEL[wallet]}.`,
    ].join('\n');
  }

  askOpeningBalanceFor(wallet: Wallet): string {
    return [
      `💰 Berapa saldo *${WALLET_LABEL[wallet]}* kamu sekarang?`,
      'Balas nominal (contoh: _200rb_ atau _1 juta_), atau *lewati* kalau belum mau mengisi.',
    ].join('\n');
  }

  openingBalanceAck(wallet: Wallet, amount: Money | null): string {
    return amount
      ? `✅ Saldo awal ${WALLET_LABEL[wallet]}: *${amount.format()}*`
      : `⏭️ Saldo awal ${WALLET_LABEL[wallet]} dilewati.`;
  }

  openingBalanceDone(): string {
    return 'Siap! Ketik *saldo* untuk melihat saldo, atau langsung catat transaksi. Saldo awal bisa diubah kapan saja: _saldo awal cash 200rb_ 🚀';
  }

  openingBalanceRetry(wallet: Wallet): string {
    return `Balas nominal saldo ${WALLET_LABEL[wallet]} (contoh: _200rb_), atau *lewati*. Ketik *batal* untuk berhenti. 🙂`;
  }

  walletModeBlocked(blocked: Wallet): string {
    return [
      `⚠️ Dompet ${WALLET_LABEL[blocked]} sudah punya transaksi atau saldo, jadi tidak bisa dinonaktifkan.`,
      'Pilih *Cash dan Digital*, atau ketik _atur dompet_ untuk memilih lagi.',
    ].join('\n');
  }

  inactiveWallet(wallet: Wallet): string {
    return `Dompet ${WALLET_LABEL[wallet]} tidak aktif. Ketik _atur dompet_ untuk mengubah.`;
  }

  defaultNotNeeded(only: Wallet): string {
    return `Kamu hanya memakai dompet ${WALLET_LABEL[only]}, jadi default tidak perlu diatur. Ketik _atur dompet_ untuk mengubah.`;
  }

  transferNeedsBoth(): string {
    return 'Transfer antar dompet hanya tersedia jika memakai Cash dan Digital. Ketik _atur dompet_ untuk mengubah.';
  }

  transferSameWallet(): string {
    return 'Dompet asal dan tujuan tidak boleh sama. 🙂';
  }

  openingBalanceSet(wallet: Wallet, amount: Money): string {
    return `✅ Saldo awal ${WALLET_LABEL[wallet]} diatur: *${amount.format()}*`;
  }

  askOpeningBalance(): string {
    return 'Sebutkan dompet dan nominalnya. Contoh: _saldo awal cash 200rb_ atau _saldo awal digital 1 juta_';
  }

  defaultWalletSet(wallet: Wallet): string {
    return `✅ Dompet default diatur ke ${WALLET_LABEL[wallet]}. Transaksi tanpa keterangan dompet akan masuk ke sini.`;
  }

  askDefaultWallet(): string {
    return 'Pilih dompet default: _default cash_ atau _default digital_';
  }

  budgetSet(result: SetBudgetResult): string {
    const { budget, category } = result;
    const scope = category ? this.categoryLabel(category.name, category.icon) : 'Keseluruhan';
    return `🎯 Budget diatur: *${scope}* — ${budget.amount.format()} / ${BUDGET_PERIOD_WORD[budget.period]}`;
  }

  budgetAlerts(alerts: BudgetAlert[]): string {
    return alerts
      .map((a) =>
        a.exceeded
          ? `⚠️ Budget *${a.categoryName}* ${BUDGET_PERIOD_WORD[a.period]} terlampaui! ${a.used.format()} / ${a.limit.format()} (${a.percent}%)`
          : `⚠️ Budget *${a.categoryName}* ${BUDGET_PERIOD_WORD[a.period]} sudah ${a.percent}% terpakai (${a.used.format()} / ${a.limit.format()})`,
      )
      .join('\n');
  }

  exportCaption(rowCount: number): string {
    return rowCount > 0
      ? `📁 Laporan Excel (${rowCount} transaksi).`
      : 'Belum ada transaksi untuk diexport pada periode ini.';
  }

  resetConfirm(): string {
    return [
      '⚠️ *Yakin mau reset SEMUA data?*',
      'Seluruh transaksi dan budget kamu akan *dihapus permanen* dan tidak bisa dikembalikan.',
      '',
      'Ketik *ya* untuk reset, *tidak* untuk batal.',
    ].join('\n');
  }

  resetConfirmRetry(): string {
    return 'Ketik *ya* untuk reset semua data, atau *tidak* untuk membatalkan. 🙂';
  }

  dataReset(): string {
    return '✅ Semua data kamu sudah direset. Yuk mulai catat dari awal! 🆕';
  }

  private categoryLabel(name?: string | null, icon?: string | null): string {
    const label = name ?? 'Lainnya';
    return icon ? `${icon} ${label}` : label;
  }

  private help(): string {
    return [
      '*📖 Menu Cuanki*',
      '',
      '*💸 Catat pengeluaran:*',
      '• _beli kopi 25rb_',
      '• _isi bensin 100rb_',
      '• _makan bakso kemarin 15rb_',
      '',
      '*💰 Catat pemasukan:*',
      '• _gaji 8 juta_',
      '• _dapat bonus 500rb_',
      '',
      '*📊 Ringkasan:*',
      '• _ringkasan hari ini / minggu ini / bulan ini_',
      '• _ringkasan 13/07/2026 - 14/07/2026_',
      '',
      '*💵 Dompet Cash:*',
      '• _beli kopi 25rb cash_',
      '• _bayar bakso 15rb tunai_',
      '',
      '*📱 Dompet Digital:*',
      '• _gaji 5 juta transfer_',
      '• _bensin 50rb gopay_',
      '• _makan 30rb qris_',
      '• kata lain: ovo, shopeepay, debit, bca, bri, bni, mandiri',
      '',
      '*🔁 Transfer antar dompet:*',
      '• _tarik tunai 500rb_ (digital ke cash)',
      '• _setor tunai 200rb_ (cash ke digital)',
      '• _pindah 300rb dari cash ke digital_',
      '• _hapus transfer_ (batalkan transfer terakhir)',
      '',
      '*👛 Saldo & pengaturan dompet:*',
      '• _saldo_ (saldo cash dan digital)',
      '• _atur dompet_ (pilih cash saja, digital saja, atau keduanya)',
      '• _saldo awal cash 200rb_',
      '• _default digital_ (dompet jika tidak disebut)',
      '• _edit ke digital_ (ubah dompet transaksi terakhir)',
      '',
      '*🎯 Budget:*',
      '• _budget makan 2 juta_',
      '',
      '*✏️ Kelola transaksi terakhir:*',
      '• _edit jadi 30rb_',
      '• _hapus_',
      '',
      '*📁 Export:*',
      '• _export hari ini / minggu ini / bulan ini_',
      '• _export 13/07/2026 - 14/07/2026_',
      '',
      '*🔄 Reset:*',
      '• _reset_ (hapus semua data, mulai dari awal)',
    ].join('\n');
  }
}
