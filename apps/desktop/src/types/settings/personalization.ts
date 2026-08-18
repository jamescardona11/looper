type StringFields<Names extends PropertyKey> = {
  [Field in Names]: string;
};

export type Replacement = StringFields<"from" | "to">;
export type UserSnippet = StringFields<"trigger" | "expansion">;

export type AppBinding = StringFields<"name"> & {
  identifier?: string | null;
};

type PersonalityCollections = {
  apps: AppBinding;
  websites: string;
  instructions: string;
};

export type Personality = StringFields<"id" | "name"> & { enabled: boolean } & {
  [
    Collection in keyof PersonalityCollections
  ]: PersonalityCollections[Collection][];
};
