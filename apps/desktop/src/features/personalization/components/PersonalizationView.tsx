import { PersonalizationViewContent } from "./personalization-view-content";
import type { PersonalizationViewProps } from "./personalization-view-model";

const PersonalizationView = (props: PersonalizationViewProps) => (
  <PersonalizationViewContent {...props} />
);

export default PersonalizationView;
