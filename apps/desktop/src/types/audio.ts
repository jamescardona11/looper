type DeviceIdentity = {
  id: string;
  name: string;
};

export type DeviceInfo = DeviceIdentity & {
  is_default: boolean;
};
