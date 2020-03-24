const BYTE_UNITS = [
  'B',
  'KiB',
  'MiB',
  'GiB',
  'TiB',
  'PiB',
  'EiB',
  'ZiB',
  'YiB'
];

export default function prettyBytes(bytes: number, level = 0, negated = false): string {
  const negative = negated || bytes < 0;
  const normalizedBytes = Math.abs(bytes);

  if ((normalizedBytes / 1024) > 1) {
    return prettyBytes(normalizedBytes / 1024, level + 1, negative);
  }

  const paddedBytes = normalizedBytes * 10;
  const rounded = Math.round(((negative) ? -1 : 1) * paddedBytes) / 10;
  return `${rounded} ${BYTE_UNITS[level]}`;
}
