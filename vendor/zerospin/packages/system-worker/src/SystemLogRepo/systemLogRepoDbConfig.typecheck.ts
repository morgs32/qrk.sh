import type { ISystemLogRow } from '@zerospin/core/system/types';
import type {
  ILogRecord,
  ISpanLinkRecord,
  ISpanRecord,
} from '@zerospin/logger';
import type { InferDecodedRow } from '@zerospin/schema';
import { assert, type Equals } from 'tsafe';

import type { systemLogRepoDbConfig } from './systemLogRepoDbConfig.js';

assert<
  Equals<
    Readonly<InferDecodedRow<typeof systemLogRepoDbConfig.tables.logs.shape>>,
    ISystemLogRow
  >
>();

assert<
  Equals<
    Readonly<
      Omit<
        InferDecodedRow<
          typeof systemLogRepoDbConfig.tables.telemetrySpans.shape
        >,
        'systemId'
      >
    >,
    ISpanRecord
  >
>();

assert<
  Equals<
    Readonly<
      Omit<
        InferDecodedRow<
          typeof systemLogRepoDbConfig.tables.telemetryLogs.shape
        >,
        'systemId'
      >
    >,
    ILogRecord
  >
>();

assert<
  Equals<
    Readonly<
      Omit<
        InferDecodedRow<
          typeof systemLogRepoDbConfig.tables.telemetryLinks.shape
        >,
        'systemId'
      >
    >,
    ISpanLinkRecord
  >
>();
