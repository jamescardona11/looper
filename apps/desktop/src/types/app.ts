export interface StorageBreakdown {
  total_bytes: number;
  recordings_bytes: number;
  library_bytes: number;
  databases_bytes: number;
  models_bytes: number;
}

export interface AppInfo {
  version: string;
  data_dir_path: string;
  data_dir_size_bytes: number;
  storage_breakdown: StorageBreakdown;
}
