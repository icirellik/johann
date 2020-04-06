const BYTE_UNITS = [
  'B',
  'kB',
  'MB',
  'GB',
  'TB',
  'PB',
  'EB',
  'ZB',
  'YB'
];

function unprettyBytesImpl(bytes: number, level = 0): number {
  if (level === 0) {
    return bytes;
  }

  return unprettyBytesImpl(bytes * 1000, level - 1);
}

/**
 * Takes the human readble bytes and converts them back to an a numeric byte
 * form.
 *
 * @param human
 */
export default function unprettyBytes(human: string): number {
  let index = -1;
  for (const suffix of BYTE_UNITS) {
    if (human.endsWith(suffix)) {
      index = BYTE_UNITS.indexOf(suffix);
    }
  }

  if (index === -1) {
    return 0;
  }

  return unprettyBytesImpl(Number.parseFloat(human), index);
}
