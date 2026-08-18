import LibraryViewContent, {
  type LibraryViewContentProps,
} from "./library-view-content";

type LibraryViewProps = Omit<
  LibraryViewContentProps,
  "data-notification-position"
>;

const LibraryView = (props: LibraryViewProps) => (
  <LibraryViewContent {...props} data-notification-position="library-header" />
);

export default LibraryView;
