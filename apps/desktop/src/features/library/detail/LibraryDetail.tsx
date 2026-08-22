import { LibraryDetailSession } from "./library-detail-session";
import type { LibraryDetailProps } from "./library-detail-types";

const LibraryDetail = (props: LibraryDetailProps) => (
  <LibraryDetailSession key={props.item.id} {...props} />
);

export default LibraryDetail;
