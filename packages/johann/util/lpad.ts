/**
 * Quick and dirty way to do padding.
 *
 * @param lexeme
 * @param maxLength
 */
export default function lpad(lexeme: string, maxLength: number): string {
  const rawCharacters = lexeme.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  return lexeme.padEnd(maxLength + lexeme.length - rawCharacters.length, ' ');
}
