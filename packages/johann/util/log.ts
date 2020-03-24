const partials = new Map<number, string>();

let PARTIAL_ID_COUNTER = 0;
export function partial(lexeme: string, partialId?: number): number {
  let activeId: number;
  if (!partialId) {
    activeId = PARTIAL_ID_COUNTER + 1;
    PARTIAL_ID_COUNTER = activeId;
  } else {
    activeId = partialId;
  }

  if (partials.has(activeId)) {
    partials.set(activeId, partials.get(activeId) + lexeme);
  } else {
    partials.set(activeId, lexeme);
  }
  return activeId;
}

export function flush(partialId: number): void {
  const log = partials.get(partialId);
  if (log) {
    process.stdout.write(log);
  }
  partials.delete(partialId);
}
