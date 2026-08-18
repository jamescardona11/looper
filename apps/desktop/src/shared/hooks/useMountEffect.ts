import {
  useEffect,
  type EffectCallback,
} from "react";

export function useMountEffect(effect: EffectCallback): void {
  useEffect(effect, []);
}
