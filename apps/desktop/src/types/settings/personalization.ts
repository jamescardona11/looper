export type Replacement = {
  from: string;
  to: string;
};

export type UserSnippet = {
  trigger: string;
  expansion: string;
};

export type AppBinding = {
  name: string;
  identifier?: string | null;
};

export type Personality = {
  id: string;
  name: string;
  enabled: boolean;
  apps: AppBinding[];
  websites: string[];
  instructions: string[];
};
