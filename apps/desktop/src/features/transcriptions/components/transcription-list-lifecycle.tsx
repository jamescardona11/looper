import { useMemo, useRef, type RefObject } from "react";
import { useMountEffect } from "../../../shared/hooks/useMountEffect";
import type { TranscriptionRecord } from "../../../contracts";

const dataIds = new WeakMap<TranscriptionRecord[], number>();
let nextDataId = 1;

export function transcriptionDataKey(records: TranscriptionRecord[]): number {
  const known = dataIds.get(records);
  if (known !== undefined) return known;
  const assigned = nextDataId++;
  dataIds.set(records, assigned);
  return assigned;
}

export function focusRecordBridgeKey(
  recordId: string | null,
  records: TranscriptionRecord[],
): string {
  return `${recordId ?? "none"}:${transcriptionDataKey(records)}`;
}

export function FocusRecordSearchBridge(props: {
  recordId: string | null;
  records: TranscriptionRecord[];
  lastFocusedRef: RefObject<string | null>;
  onFocusRecord: (text: string) => void;
}) {
  useMountEffect(() => {
    if (!props.recordId || props.lastFocusedRef.current === props.recordId) {
      return;
    }
    const record = props.records.find(({ id }) => id === props.recordId);
    if (!record) return;
    props.lastFocusedRef.current = props.recordId;
    props.onFocusRecord(record.text);
  });
  return null;
}

export function SearchInputFocus(props: {
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  useMountEffect(() => {
    const frame = requestAnimationFrame(() => props.inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  });
  return null;
}

export function useFreshTranscriptionIds(
  records: TranscriptionRecord[],
  fetched: boolean,
): ReadonlySet<string> {
  const cacheRef = useRef<{
    data: TranscriptionRecord[] | null;
    seen: Set<string>;
  }>({ data: null, seen: new Set() });
  const freshIds = useMemo(() => {
    if (!fetched) return new Set<string>();
    const cache = cacheRef.current;
    if (cache.data === records) return new Set<string>();
    const fresh = new Set<string>();
    for (const record of records) {
      if (cache.data !== null && !cache.seen.has(record.id))
        fresh.add(record.id);
      cache.seen.add(record.id);
    }
    cache.data = records;
    return fresh;
  }, [records, fetched]);
  return freshIds;
}

export function FreshAnimationExpiry(props: { freshIds: ReadonlySet<string> }) {
  useMountEffect(() => {
    if (props.freshIds.size === 0) return;
    const timer = setTimeout(() => {
      if (props.freshIds instanceof Set) props.freshIds.clear();
    }, 600);
    return () => clearTimeout(timer);
  });
  return null;
}
