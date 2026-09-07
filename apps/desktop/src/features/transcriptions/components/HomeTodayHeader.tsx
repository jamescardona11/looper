import {
  type HomeTodayHeaderProps,
  useHomeTodayHeaderContent,
} from "./use-home-today-header-content";

export default function HomeTodayHeader(props: HomeTodayHeaderProps) {
  const { stats, active } = props;
  const { greeting } = useHomeTodayHeaderContent(stats, active);

  return (
    <header className="mb-6 shrink-0">
      <p className="ui-text-uppercase-micro ui-color-accent">Dictation</p>
      <h1 className="mt-1 font-display ui-text-screen-title ui-color-primary font-semibold">
        {greeting}
      </h1>
    </header>
  );
}
