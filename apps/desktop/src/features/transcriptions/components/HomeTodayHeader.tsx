import {
  type HomeTodayHeaderProps,
  useHomeTodayHeaderContent,
} from "./use-home-today-header-content";

export default function HomeTodayHeader(props: HomeTodayHeaderProps) {
  const { transcriptionsFetched, stats, active } = props;
  const { dateLabel, greeting, statText } = useHomeTodayHeaderContent(
    stats,
    active,
  );

  return (
    <header className="mb-6 shrink-0">
      <p className="ui-text-uppercase-micro ui-color-muted capitalize">
        {dateLabel}
      </p>
      <h1 className="mt-1 font-satoshi ui-text-screen-title ui-color-primary font-semibold">
        {greeting}
      </h1>
      {transcriptionsFetched && statText ? (
        <p className="mt-1.5 ui-text-body-sm ui-color-muted">{statText}</p>
      ) : null}
    </header>
  );
}
