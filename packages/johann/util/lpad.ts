/**
 * Quick and dirty way to do padding.
 *
 * @param lexeme
 * @param maxLength
 */
export function lpad(lexeme: string, maxLength: number): string {
  return lexeme.padEnd(maxLength, ' ');
}
