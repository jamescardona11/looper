import { UpdateCheckerView } from "./update-checker-view";
import { useUpdateChecker } from "./use-update-checker";

type UpdateCheckerProps = {
  autoCheck?: boolean;
};

export function UpdateChecker({ autoCheck = true }: UpdateCheckerProps) {
  return <UpdateCheckerView {...useUpdateChecker(autoCheck)} />;
}
