const licenseValueCatalog = {
  status: ["trial", "active", "expired", "invalid"],
  edition: ["personal", "commercial", "founder", "contributor"],
} as const;

export const LICENSE_STATUSES = [...licenseValueCatalog.status] as const;
export const LICENSE_EDITIONS = [...licenseValueCatalog.edition] as const;

export type LicenseStatus = (typeof licenseValueCatalog.status)[number];
export type LicenseEdition = (typeof licenseValueCatalog.edition)[number];

type OptionalNullable<T> = {
  [Field in keyof T]?: T[Field] | null;
};

type RequiredFields<Names extends PropertyKey, Value> = {
  [Field in Names]: Value;
};

type LicenseIdentity = OptionalNullable<{
  edition: LicenseEdition;
  displayKey: string;
  customerEmail: string;
  customerName: string;
}>;

type LicenseAudit = OptionalNullable<
  RequiredFields<
    "lastValidatedAt" | "activatedAt" | "purchasedAt" | "expiresAt",
    string
  > &
    RequiredFields<
      "validations" | "usage" | "limitUsage" | "activationsCount",
      number
    >
>;

type LicenseEntitlements = RequiredFields<
  "licenseGateActive" | "trialActive",
  boolean
> &
  RequiredFields<"trialStartedAt" | "trialEndsAt", string> &
  RequiredFields<"trialDaysRemaining" | "activationsLimit", number>;

export type LicenseState = LicenseIdentity &
  LicenseAudit &
  LicenseEntitlements & { status: LicenseStatus };
