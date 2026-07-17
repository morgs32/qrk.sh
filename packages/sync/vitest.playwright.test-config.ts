declare const __TEST_WORKER_URL__: string;

export function getTestWorkerUrl(): string {
  return __TEST_WORKER_URL__;
}

export function getTestWorkerHost(): {
  host: string;
  protocol: 'ws' | 'wss';
} {
  const url = new URL(getTestWorkerUrl());
  const protocol = url.protocol === 'https:' ? 'wss' : 'ws';
  const defaultPort = protocol === 'wss' ? '443' : '80';
  const host =
    url.port === '' || url.port === defaultPort
      ? url.hostname
      : `${url.hostname}:${url.port}`;
  return { host, protocol };
}
