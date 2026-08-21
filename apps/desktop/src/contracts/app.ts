type StorageCategory =
  | "total_bytes"
  | "recordings_bytes"
  | "library_bytes"
  | "databases_bytes"
  | "models_bytes";

export type StorageBreakdown = Record<StorageCategory, number>;

type AppIdentity = {
  version: string;
  data_dir_path: string;
};

export type AppInfo = AppIdentity &
  Record<"data_dir_size_bytes", number> & {
    storage_breakdown: StorageBreakdown;
  };
