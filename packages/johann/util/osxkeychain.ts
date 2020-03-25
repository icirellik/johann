import { spawn } from 'child_process';

/**
 * The location of the osx keychain application.
 */
const EXECUTABLE_PATH = '/usr/bin/security';

interface KeychainAccountOptions {
  label: string;
  service: string;
  type: 'internet';
}

export interface InternetPassword {
  account: string;
  password: string;
}

type PasswordCallback = (err: Error | null, account: InternetPassword | null) => void

class UnsupportedPlatformError extends Error {
  public type = 'UnsupportedPlatformError';
  public code = 'UnsupportedPlatform';
  public message: string;
  public stack?: string;

  static DEFAULT_MESSAGE = 'Expected darwin platform, got: ';

  constructor(msg?: string | null, append?: string | null) {
    super();
    this.message = (msg || UnsupportedPlatformError.DEFAULT_MESSAGE) + (append || '');
    this.stack = (new Error()).stack;
  }
}

class ServiceFailureError extends Error {
  public type = 'ServiceFailureError';
  public code = 'ServiceFailure';
  public message: string;
  public stack?: string;

  static DEFAULT_MESSAGE = 'Keychain failed to start child process: ';

  constructor(msg?: string | null, append?: string | null) {
    super();
    this.message = (msg || ServiceFailureError.DEFAULT_MESSAGE) + (append || '');
    this.stack = (new Error()).stack;
  }
}

class PasswordNotFoundError extends Error {
  public type = 'PasswordNotFoundError';
  public code = 'PasswordNotFound';
  public message: string;
  public stack?: string;

  static DEFAULT_MESSAGE = 'Could not find password';

  constructor(msg?: string | null, append?: string | null) {
    super();
    this.message = (msg || PasswordNotFoundError.DEFAULT_MESSAGE) + (append || '');
    this.stack = (new Error()).stack;
  }
}

class KeychainAccess {

  /**
   * Retrieve a password from the keychain.
   *
   * @param {Object} opts Object containing `account` and `service`
   * @param {Function} cb Callback
   * @api public
   */
  async getPassword(opts: KeychainAccountOptions): Promise<InternetPassword> {
    return new Promise((res, rej) => {
      if (process.platform !== 'darwin') {
        rej(new UnsupportedPlatformError(null, process.platform));
      }

      const security = spawn(EXECUTABLE_PATH, [
        'find-' + opts.type + '-password',
        '-l', opts.label,
        '-s', opts.service,
        '-g',
      ]);
      let keychain = '';
      let password = '';

      security.on('error', (err) => {
        throw new ServiceFailureError(null, err.message);
      });

      security.stdout.on('data', function(d) {
        keychain += d.toString();
      });

      // For better or worse, the last line (containing the actual password) is actually written to stderr instead of stdout.
      // Reference: http://blog.macromates.com/2006/keychain-access-from-shell/
      security.stderr.on('data', function(d) {
        password += d.toString();
      });

      security.on('close', (code) => {
        if (code !== 0) {
          rej(new PasswordNotFoundError());
        }

        const credentials: Partial<InternetPassword> = {};

        if (/"acct"<blob>="/.test(keychain)) {
          const account = keychain.match(/"acct"<blob>="(.*)"/)![1];
          credentials.account = account;
        }

        if (/password/.test(password)) {
          // When keychain escapes a char into octal it also includes a hex
          // encoded version.
          //
          // e.g. password 'passWith\' becomes:
          // password: 0x70617373576974685C  "passWith\134"
          //
          // And if the password does not contain ASCII it leaves out the quoted
          // version altogether:
          //
          // e.g. password '∆˚ˆ©ƒ®∂çµ˚¬˙ƒ®†¥' becomes:
          // password: 0xE28886CB9ACB86C2A9C692C2AEE28882C3A7C2B5CB9AC2ACCB99C692C2AEE280A0C2A5
          if (/0x([0-9a-fA-F]+)/.test(password)) {
            const hexPassword = password.match(/0x([0-9a-fA-F]+)/)![1];
            credentials.password = Buffer.from(hexPassword, 'hex').toString();
            res(credentials as InternetPassword);
          } else {
            // Otherwise the password will be in quotes:
            // password: "passWithoutSlash"
            credentials.password = password.match(/"(.*)"/)![1];
            res(credentials as InternetPassword);
          }
        } else {
          rej(new PasswordNotFoundError());
        }
      });
    });
  }
}

export default KeychainAccess;
