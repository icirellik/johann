import chalk from 'chalk';
import prettyBytes from './prettyBytes';

/**
 * Pretty prints and highlights values based on their size.
 *
 * @param bytes The number of bytes.
 */
export default function highlightSize(bytes: number): string {
  if (bytes > 1000000000) {
    return chalk.bgRed(prettyBytes(bytes));
  } else if (bytes > 500000000) {
    return chalk.red(prettyBytes(bytes));
  } else if (bytes > 100000000) {
    return chalk.yellow(prettyBytes(bytes));
  } else {
    return chalk.green(prettyBytes(bytes));
  }
}
