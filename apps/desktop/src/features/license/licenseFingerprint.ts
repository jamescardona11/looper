const DEFAULT_SEED_TEXT = "looper";
const HASH_RADIX = 31;

function keyTail(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, "");
  return normalized.slice(-8) || DEFAULT_SEED_TEXT;
}

function hashKeyTail(tail: string) {
  return [...tail].reduce(
    (hash, character) =>
      (Math.imul(hash, HASH_RADIX) + character.charCodeAt(0)) >>> 0,
    0,
  );
}

function deriveLicenseSeed(key: string) {
  return hashKeyTail(keyTail(key)) || 1;
}

type RandomSample = Readonly<{ state: number; value: number }>;

function nextMulberrySample(state: number): RandomSample {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let mixed = Math.imul(nextState ^ (nextState >>> 15), 1 | nextState);
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
  return {
    state: nextState,
    value: ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296,
  };
}

function createSeededRandom(seed: number) {
  let cursor = seed >>> 0;
  return () => {
    const sample = nextMulberrySample(cursor);
    cursor = sample.state;
    return sample.value;
  };
}

function buildSeededDotField(
  key: string | null | undefined,
  rows: number,
  columns: number,
  density = 0.34,
) {
  const random = createSeededRandom(deriveLicenseSeed(key ?? DEFAULT_SEED_TEXT));
  const activeCells = new Set<number>();
  const cellCount = rows * columns;

  let cell = 0;
  while (cell < cellCount) {
    if (random() < density) activeCells.add(cell);
    cell += 1;
  }
  return activeCells;
}

export {
  deriveLicenseSeed as seedFromLicenseKey,
  createSeededRandom as mulberry32,
  buildSeededDotField as seededDotField,
};
