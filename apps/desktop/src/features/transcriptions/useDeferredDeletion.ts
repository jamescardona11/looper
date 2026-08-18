import { useCallback, useEffect, useRef, useState } from "react";
import { useMountEffect } from "../../shared/hooks/useMountEffect";

/**
 * Mantiene una eliminación reversible en UI antes de ejecutar el borrado
 * permanente. Si la vista se desmonta, confirma lo pendiente para que la
 * acción del usuario no se pierda al navegar.
 */
export function useDeferredDeletion(
  commit: (id: string) => Promise<unknown>,
  delayMs: number,
) {
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const timersRef = useRef(new Map<string, number>());
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  const removePending = useCallback((id: string) => {
    setPendingIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const requestDeletion = useCallback(
    (id: string) => {
      if (timersRef.current.has(id)) return;
      setPendingIds((current) => new Set(current).add(id));
      const timer = window.setTimeout(() => {
        timersRef.current.delete(id);
        removePending(id);
        void commitRef.current(id);
      }, delayMs);
      timersRef.current.set(id, timer);
    },
    [delayMs, removePending],
  );

  const undoDeletion = useCallback(
    (id: string) => {
      const timer = timersRef.current.get(id);
      if (timer == null) return false;
      window.clearTimeout(timer);
      timersRef.current.delete(id);
      removePending(id);
      return true;
    },
    [removePending],
  );

  useMountEffect(() => () => {
    const pending = [...timersRef.current.entries()];
    timersRef.current.clear();
    pending.forEach(([id, timer]) => {
      window.clearTimeout(timer);
      void commitRef.current(id);
    });
  });

  return { pendingIds, requestDeletion, undoDeletion };
}
