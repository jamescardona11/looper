import { LibraryCardContent } from "./library-card-content";
import type { LibraryCardProps } from "./library-card-model";

const LibraryCard = (props: LibraryCardProps) => (
  <LibraryCardContent {...props} />
);

export default LibraryCard;
