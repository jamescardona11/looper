/**
 * Trazos copiados de los artboards del rediseño (rejilla de 24, trazo de 2).
 * Cada icono es la lista de subtrazos que lo componen, en orden de pintado.
 */
export const ICON_PATHS = {
  library: ["M4 5h6v14H4Z", "M12 5h4v14h-4Z", "m18.6 5.8 2.4 12.8"],
  ask: ["M20 11a8 8 0 0 1-11.6 7.1L4 19l1-4.2A8 8 0 1 1 20 11Z"],
  studio: ["M4 8.5h16", "M4 16h16", "M9.5 6v5", "M15 13.5v5"],
  meeting: [
    "M15 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z",
    "m22 8-5 4 5 4V8Z",
  ],
  dictado: [
    "M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z",
    "M5 11a7 7 0 0 0 14 0",
    "M12 18v4",
  ],
  nota: ["M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z", "M14 4v5h5"],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z", "m20 20-3.6-3.6"],
  import: ["M12 15V3", "m7.5 7.5 4.5-4.5 4.5 4.5", "M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"],
  plus: ["M12 5v14", "M5 12h14"],
  close: ["M6 6 18 18", "M18 6 6 18"],
  check: ["m5 12.5 4.5 4.5L19 7.5"],
  chevronRight: ["m9.5 5 7 7-7 7"],
  chevronLeft: ["m14.5 5-7 7 7 7"],
  chevronDown: ["m6 9.5 6 6 6-6"],
  bookmark: ["M5 3v18l7-5 7 5V3Z"],
  mic: ["M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z", "M5 11a7 7 0 0 0 14 0", "M12 18v4"],
  stop: ["M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"],
  arrowUp: ["M12 19V5", "m6 11 6-6 6 6"],
  globe: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
    "M3.5 12h17",
    "M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z",
  ],
  keyboard: ["M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z", "M8 15h8"],
  lock: [
    "M6 10h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z",
    "M8.5 10V7a3.5 3.5 0 0 1 7 0v3",
  ],
  refresh: [
    "M20 11.5a8 8 0 0 1-13.7 5.6L4 15",
    "M4 12.5a8 8 0 0 1 13.7-5.6L20 9",
    "M20 4v5h-5",
    "M4 20v-5h5",
  ],
  more: ["M12 6.5v.01", "M12 12v.01", "M12 17.5v.01"],
  edit: ["M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z"],
  warning: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 8.5v5", "M12 16.5v.5"],
} as const;

export type IconName = keyof typeof ICON_PATHS;
