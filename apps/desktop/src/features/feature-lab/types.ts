export type FeatureDiagnostic = {
  id: string;
  label: string;
  detail: string;
  status: "pass" | "manual" | "fail";
  checkedAt?: string;
};
