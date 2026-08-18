/**
 * Agrupa items en tramos de día contiguos ("Today", "Yesterday", fecha corta).
 * Vive fuera de las vistas porque Meetings y Memory muestran el mismo archivo
 * con distinta forma: una sola regla de corte evita que se separen.
 *
 * Asume que `items` ya viene ordenado como se quiere mostrar; solo corta donde
 * cambia el día natural.
 */
export type DayGroup<T> = {
  key: string;
  label: string;
  items: T[];
};

export type DayGroupLabels = {
  today: string;
  yesterday: string;
};

export function groupByDay<T>(
  items: readonly T[],
  timestampOf: (item: T) => number,
  labels: DayGroupLabels,
  now: number = Date.now(),
): DayGroup<T>[] {
  const today = new Date(now).toDateString();
  const yesterday = new Date(now - 86_400_000).toDateString();
  const groups: DayGroup<T>[] = [];

  for (const item of items) {
    const at = timestampOf(item);
    const day = new Date(at).toDateString();
    const label =
      day === today
        ? labels.today
        : day === yesterday
          ? labels.yesterday
          : new Date(at).toLocaleDateString([], {
              month: "short",
              day: "numeric",
            });

    const last = groups[groups.length - 1];
    if (last?.key === day) last.items.push(item);
    else groups.push({ key: day, label, items: [item] });
  }

  return groups;
}
