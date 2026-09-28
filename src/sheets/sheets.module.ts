import { Global, Module } from '@nestjs/common';
import { SheetsClient } from './sheets.client';

/**
 * Global persistence module. SheetsClient is provided app-wide so the
 * repository adapters can inject it without re-importing this module.
 */
@Global()
@Module({
  providers: [SheetsClient],
  exports: [SheetsClient],
})
export class SheetsModule {}
