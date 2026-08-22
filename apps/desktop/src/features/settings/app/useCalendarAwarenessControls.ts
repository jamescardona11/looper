import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCalendarAccessStatus,
  requestCalendarAccess,
  type CalendarAccessStatus,
} from "../../../data/meeting/meeting-awareness";

const calendarAccessKey = ["calendar", "access"] as const;

export function useCalendarAwarenessControls({
  supported,
  enabled,
  onEnabledChange,
}: {
  supported: boolean;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const accessQuery = useQuery({
    queryKey: calendarAccessKey,
    queryFn: getCalendarAccessStatus,
    enabled: supported,
    retry: false,
  });
  const accessRequest = useMutation({
    mutationFn: requestCalendarAccess,
    onSuccess: (granted) => {
      const status: CalendarAccessStatus = granted ? "authorized" : "denied";
      queryClient.setQueryData(calendarAccessKey, status);
      onEnabledChange(granted);
    },
  });

  const toggle = async () => {
    if (enabled) {
      onEnabledChange(false);
      return;
    }
    await accessRequest.mutateAsync();
  };

  return {
    access: supported
      ? (accessQuery.data ??
        (accessQuery.isError ? "denied" : "not_determined"))
      : ("unsupported" as const),
    busy: accessRequest.isPending,
    toggle,
  };
}
