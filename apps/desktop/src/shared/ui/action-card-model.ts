import type {
  ButtonHTMLAttributes,
  ComponentProps,
  CSSProperties,
  ReactNode,
} from "react";
import type { ActionCardContent } from "./action-card-content";
import {
  actionCardPresentation,
  type ActionCardPresentation,
} from "./action-card-presentation";
import {
  resolveActionCardAccent,
  type ActionCardAccent,
  type ActionCardAccentPreset,
} from "./actionCardButtonAccents";

type CardOptionals = {
  description: string;
  icon: ReactNode;
  accent: Partial<ActionCardAccent>;
  accentPreset: ActionCardAccentPreset;
  iconClassName: string;
  titleClassName: string;
  descriptionClassName: string;
  contentClassName: string;
  fullWidth: boolean;
};

export type ActionCardButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  title: string;
} & Partial<CardOptionals>;

type ActionCardModel = {
  nativeProps: ButtonHTMLAttributes<HTMLButtonElement>;
  contentProps: ComponentProps<typeof ActionCardContent>;
  view: ActionCardPresentation;
};

export function actionCardModel(props: ActionCardButtonProps): ActionCardModel {
  const {
    accent,
    accentPreset = "interactive",
    className,
    contentClassName,
    description,
    descriptionClassName,
    fullWidth = true,
    icon,
    iconClassName,
    style,
    title,
    titleClassName,
    type = "button",
    ...nativeProps
  } = props;
  const view = actionCardPresentation(
    resolveActionCardAccent(accentPreset, accent),
    fullWidth,
    Boolean(description),
    {
      className,
      contentClassName,
      iconClassName,
      titleClassName,
      descriptionClassName,
      style,
    },
  );
  return {
    view,
    nativeProps: {
      ...nativeProps,
      type,
      className: view.buttonClassName,
      style: view.buttonStyle as CSSProperties,
    },
    contentProps: { title, description, icon, view },
  };
}
