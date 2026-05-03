import { createInterface } from 'node:readline';

/**
 * Prompt for a secret on stdin.
 *
 * - On a TTY: echo is suppressed via raw mode.
 * - When stdin is piped (e.g. `echo "$KEY" | otcli login`): reads a single line.
 *
 * The returned string is trimmed of trailing whitespace.
 */
export function promptSecret(message: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return new Promise((resolve, reject) => {
      const rl = createInterface({ input: process.stdin, terminal: false });
      rl.once('line', (line) => {
        rl.close();
        resolve(line.trim());
      });
      rl.once('close', () => resolve(''));
      rl.once('error', reject);
    });
  }

  return new Promise<string>((resolve, reject) => {
    process.stdout.write(message);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    let value = '';
    const cleanup = (): void => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        switch (byte) {
          case 0x03: // Ctrl-C
            cleanup();
            process.stdout.write('\n');
            reject(new Error('aborted'));
            return;
          case 0x0a: // \n
          case 0x0d: // \r
            cleanup();
            process.stdout.write('\n');
            resolve(value);
            return;
          case 0x7f: // DEL
          case 0x08: // backspace
            if (value.length > 0) value = value.slice(0, -1);
            continue;
          default:
            if (byte < 0x20) continue; // ignore other control bytes
            value += String.fromCharCode(byte);
        }
      }
    };
    process.stdin.on('data', onData);
  });
}
