import { useQuery } from "@tanstack/react-query";
import { useId, useRef } from "react";
import {
  probeLibraryImportFiles,
  type ImportFileProbe,
} from "../../../data/library";

type ProbeIndex = Record<string, ImportFileProbe>;

const indexProbes = (
  current: ProbeIndex,
  results: ImportFileProbe[],
): ProbeIndex => {
  const next = { ...current };
  for (const probe of results) next[probe.path] = probe;
  return next;
};

export const useLibraryImportProbes = (paths: string[]): ProbeIndex => {
  const modalInstance = useId();
  const collected = useRef<ProbeIndex>({});
  const missing = paths.filter((path) => !(path in collected.current));
  const query = useQuery({
    queryKey: ["library-import-probes", modalInstance, missing],
    enabled: missing.length > 0,
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const results = await probeLibraryImportFiles(missing);
      collected.current = indexProbes(collected.current, results);
      return collected.current;
    },
  });
  return query.data ?? collected.current;
};
