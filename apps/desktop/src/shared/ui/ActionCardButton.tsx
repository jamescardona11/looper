import { ActionCardContent } from "./action-card-content";
import {
  actionCardModel,
  type ActionCardButtonProps,
} from "./action-card-model";

export default function ActionCardButton(props: ActionCardButtonProps) {
  const card = actionCardModel(props);
  return (
    <button {...card.nativeProps}>
      <ActionCardContent {...card.contentProps} />
    </button>
  );
}
