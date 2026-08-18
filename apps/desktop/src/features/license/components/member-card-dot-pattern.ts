import {
  mulberry32,
  seededDotField,
  seedFromLicenseKey,
} from "../licenseFingerprint";
import {
  CARD_RADIUS,
  CARD_WIDTH,
  SECURITY_COLS,
  SECURITY_DOT_PITCH,
  SECURITY_DOT_SIZE,
  STRIPE_COLS,
  STRIPE_CORNER_RADIUS,
  STRIPE_DOT_PITCH,
  STRIPE_DOT_SIZE,
  STRIPE_HEIGHT,
  STRIPE_ROWS,
  STRIPE_VERTICAL_INSET,
  type MemberCardDot,
} from "./member-card-geometry";

type Point = { x: number; y: number };

const pointForCell = (
  index: number,
  columns: number,
  pitch: number,
  offset: number,
  dotSize: number,
): Point => ({
  x: offset + (index % columns) * pitch + dotSize / 2,
  y: offset + Math.floor(index / columns) * pitch + dotSize / 2,
});

const insideCardShape = (
  { x, y }: Point,
  width: number,
  height: number,
  radius: number,
): boolean => {
  if (x < 0 || x > width || y < 0 || y > height) return false;
  if (y <= height - radius || (x >= radius && x <= width - radius)) {
    return true;
  }
  const cornerX = x < radius ? radius : width - radius;
  const dx = x - cornerX;
  const dy = y - (height - radius);
  return dx * dx + dy * dy <= radius * radius;
};

const stripeCornerPoints = (): Point[] => {
  const inset = STRIPE_DOT_SIZE / 2 + 0.5;
  const arcRadius = STRIPE_CORNER_RADIUS - inset;
  const arcs = [
    { cx: STRIPE_CORNER_RADIUS, start: Math.PI, end: Math.PI / 2 },
    {
      cx: CARD_WIDTH - STRIPE_CORNER_RADIUS,
      start: Math.PI / 2,
      end: 0,
    },
  ];
  return arcs.flatMap(({ cx, start, end }) => {
    const steps = Math.max(
      2,
      Math.ceil((arcRadius * Math.abs(end - start)) / STRIPE_DOT_PITCH),
    );
    return Array.from({ length: steps + 1 }, (_, index) => {
      const angle = start + ((end - start) * index) / steps;
      return {
        x: cx + arcRadius * Math.cos(angle),
        y: STRIPE_HEIGHT - STRIPE_CORNER_RADIUS + arcRadius * Math.sin(angle),
      };
    });
  });
};

const cornerIsActive = (seedKey: string, index: number, density: number) =>
  mulberry32(
    (seedFromLicenseKey(seedKey) + Math.imul(index, 0x9e3779b1)) >>> 0,
  )() < density;

export const buildSecurityDots = (
  seedKey: string,
  cardHeight: number,
  density = 0.07,
): MemberCardDot[] => {
  const rows = Math.floor(cardHeight / SECURITY_DOT_PITCH);
  const selected = seededDotField(
    `${seedKey}:security`,
    rows,
    SECURITY_COLS,
    density,
  );
  return Array.from({ length: rows * SECURITY_COLS }, (_, index) => ({
    ...pointForCell(
      index,
      SECURITY_COLS,
      SECURITY_DOT_PITCH,
      SECURITY_DOT_PITCH / 2,
      SECURITY_DOT_SIZE,
    ),
    active: selected.has(index),
  })).filter((point) =>
    insideCardShape(point, CARD_WIDTH, cardHeight, CARD_RADIUS),
  );
};

export const buildStripeDots = (
  seedKey: string,
  density = 0.34,
): MemberCardDot[] => {
  const selected = seededDotField(seedKey, STRIPE_ROWS, STRIPE_COLS, density);
  const regular = Array.from(
    { length: STRIPE_ROWS * STRIPE_COLS },
    (_, index) => ({
      ...pointForCell(index, STRIPE_COLS, STRIPE_DOT_PITCH, 0, STRIPE_DOT_SIZE),
      active: selected.has(index),
    }),
  ).map((dot) => ({ ...dot, y: dot.y + STRIPE_VERTICAL_INSET }));
  const visibleRegular = regular.filter((point) =>
    insideCardShape(point, CARD_WIDTH, STRIPE_HEIGHT, STRIPE_CORNER_RADIUS),
  );
  const occupied = new Set(
    visibleRegular.map(
      ({ x, y }) => `${Math.round(x * 10)}:${Math.round(y * 10)}`,
    ),
  );
  const cornerOffset = STRIPE_ROWS * STRIPE_COLS;
  const corners = stripeCornerPoints().flatMap((point, index) => {
    const key = `${Math.round(point.x * 10)}:${Math.round(point.y * 10)}`;
    if (occupied.has(key)) return [];
    occupied.add(key);
    return [
      {
        ...point,
        active: cornerIsActive(seedKey, cornerOffset + index, density),
      },
    ];
  });
  return [...visibleRegular, ...corners];
};
