import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageParser } from './domain/message-parser.port';
import { RuleBasedParser } from './rule-based/rule-based.parser';

/**
 * Binds the MessageParser port to a concrete driver chosen by PARSER_DRIVER.
 * Today only `rule` exists; future AI drivers (openai/gemini/ollama) are added
 * to `providers` and this switch, with no change to any consumer.
 */
@Module({
  providers: [
    RuleBasedParser,
    {
      provide: MessageParser,
      useFactory: (config: ConfigService, rule: RuleBasedParser): MessageParser => {
        const driver = config.get<string>('parser.driver', 'rule');
        switch (driver) {
          case 'rule':
            return rule;
          default:
            throw new Error(`Unsupported PARSER_DRIVER "${driver}". Only "rule" is implemented.`);
        }
      },
      inject: [ConfigService, RuleBasedParser],
    },
  ],
  exports: [MessageParser],
})
export class ParserModule {}
