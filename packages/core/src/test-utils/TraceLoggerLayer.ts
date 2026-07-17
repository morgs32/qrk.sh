import { Logger, LogLevel } from 'effect';

export const TraceLoggerLayer = Logger.minimumLogLevel(LogLevel.Trace);
