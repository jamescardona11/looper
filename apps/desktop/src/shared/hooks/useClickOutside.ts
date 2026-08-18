import { useRef, type RefObject } from "react";
import { useMountEffect } from "./useMountEffect";

export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onOutsideClick: () => void,
  enabled = true,
): void {
  const callback = useRef(onOutsideClick);
  const active = useRef(enabled);
  callback.current = onOutsideClick;
  active.current = enabled;

  useMountEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const element = ref.current;
      if (!active.current || !element || element.contains(event.target as Node)) {
        return;
      }
      callback.current();
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  });
}
