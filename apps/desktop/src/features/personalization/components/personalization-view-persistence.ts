import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Personality } from "../../../contracts";
import { useMountEffect } from "../../../shared/hooks/useMountEffect";
import * as personalizationApi from "../../../data/personalization";
import { personalizationKeys, setPersonalitiesCache } from "../queries";
import {
  changePersonalities,
  type PersonalityChange,
} from "./personalization-view-model";

const SAVE_DELAY_MS = 500;

export function usePersonalityPersistence(fallback: Personality[]) {
  const client = useQueryClient();
  const [saveError, setSaveError] = useState<string | null>(null);
  const generation = useRef(0);
  const scheduledSave = useRef<number | null>(null);
  const pendingValue = useRef<Personality[] | null>(null);
  const isMounted = useRef(true);

  const schedule = useCallback(
    (next: Personality[]) => {
      generation.current += 1;
      const saveGeneration = generation.current;
      pendingValue.current = next;
      setPersonalitiesCache(client, next);

      if (scheduledSave.current !== null) {
        window.clearTimeout(scheduledSave.current);
      }
      scheduledSave.current = window.setTimeout(() => {
        scheduledSave.current = null;
        setSaveError(null);
        void personalizationApi.setPersonalities(next).then(
          (saved) => {
            if (!isMounted.current || generation.current !== saveGeneration) {
              return;
            }
            setPersonalitiesCache(client, saved ?? next);
          },
          (reason: unknown) => {
            if (!isMounted.current || generation.current !== saveGeneration) {
              return;
            }
            console.error(reason);
            setSaveError(
              reason instanceof Error ? reason.message : String(reason),
            );
          },
        );
      }, SAVE_DELAY_MS);
    },
    [client],
  );

  const applyChange = useCallback(
    (change: PersonalityChange) => {
      const cached = client.getQueryData<Personality[]>(
        personalizationKeys.personalities(),
      );
      schedule(changePersonalities(cached ?? fallback, change));
    },
    [client, fallback, schedule],
  );

  useMountEffect(() => {
    return () => {
      isMounted.current = false;
      if (scheduledSave.current === null) return;

      window.clearTimeout(scheduledSave.current);
      scheduledSave.current = null;
      const value = pendingValue.current;
      if (value === null) return;

      void personalizationApi
        .setPersonalities(value)
        .catch((reason: unknown) => {
          console.error("Failed to flush pending personalities", reason);
        });
    };
  });

  return { applyChange, saveError };
}
