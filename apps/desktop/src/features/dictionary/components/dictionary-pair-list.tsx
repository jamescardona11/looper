import DotMatrix from "../../../shared/ui/DotMatrix";
import {
  DictionaryPairRow,
  type DictionaryPairEditing,
  type DictionaryPairRowActions,
  type DictionaryPairRowModel,
} from "./dictionary-pair-row";

type DictionaryPairListProps = {
  pending: boolean;
  bodyClassName: string;
  rows: DictionaryPairRowModel[];
  fadeItemThreshold: number;
  panelBodyFadeClassName: string;
  loading: boolean;
  emptyTitle: string;
  emptyDescription: string;
  editing: DictionaryPairEditing;
  actions: DictionaryPairRowActions;
};

export function DictionaryPairList(props: DictionaryPairListProps) {
  const faded = props.rows.length > props.fadeItemThreshold;
  return (
    <div className="relative">
      <div
        aria-busy={props.pending}
        className={`${props.bodyClassName}${
          faded ? ` ${props.panelBodyFadeClassName}` : ""
        }`}
      >
        {props.loading ? (
          <DictionaryPairLoading />
        ) : props.rows.length === 0 ? (
          <div className="flex flex-col items-start gap-2 py-6 text-content-muted">
            <p className="ui-text-body-lg-strong">{props.emptyTitle}</p>
            <p className="ui-text-body-sm ui-color-muted text-pretty">
              {props.emptyDescription}
            </p>
          </div>
        ) : (
          props.rows.map((row, index) => (
            <DictionaryPairRow
              key={row.key}
              row={row}
              index={index}
              editing={props.editing}
              actions={props.actions}
            />
          ))
        )}
      </div>
      {faded ? (
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-20"
          style={{
            background:
              "linear-gradient(to bottom, transparent, var(--color-bg-tertiary))",
          }}
        />
      ) : null}
    </div>
  );
}

function DictionaryPairLoading() {
  return (
    <div className="flex items-center justify-center py-10">
      <DotMatrix
        rows={2}
        cols={6}
        activeDots={[0, 1, 2, 3, 4, 5]}
        dotSize={3}
        gap={3}
        color="var(--color-content-muted)"
        animated
        className="opacity-60"
      />
    </div>
  );
}
