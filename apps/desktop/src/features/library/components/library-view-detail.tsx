import type { ComponentProps } from "react";

import LibraryDetail from "./LibraryDetail";

type LibraryViewDetailProps = ComponentProps<typeof LibraryDetail>;

export function LibraryViewDetail(props: LibraryViewDetailProps) {
  return (
    <div
      key={props.item.id || "selected-library-item"}
      className="flex h-full min-h-0"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <LibraryDetail {...props} />
      </div>
    </div>
  );
}
