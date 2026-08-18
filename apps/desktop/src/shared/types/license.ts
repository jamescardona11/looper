export const LICENSE_STATUSES = [
  "trial",
  "active",
  "expired",
  "invalid",
] as const;

export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export const LICENSE_EDITIONS = [
  "personal",
  "commercial",
  "founder",
  "contributor",
] as const;

export type LicenseEdition = (typeof LICENSE_EDITIONS)[number];

type LicenseIdentity = {
  edition?: LicenseEdition | null;
  displayKey?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
};

type LicenseAudit = {
  lastValidatedAt?: string | null;
  activatedAt?: string | null;
  purchasedAt?: string | null;
  expiresAt?: string | null;
  validations?: number | null;
  usage?: number | null;
  limitUsage?: number | null;
  activationsCount?: number | null;
};

export type LicenseState = LicenseIdentity &
  LicenseAudit & {
    status: LicenseStatus;
    licenseGateActive: boolean;
    trialActive: boolean;
    trialStartedAt: string;
    trialEndsAt: string;
    trialDaysRemaining: number;
    activationsLimit: number;
  };
