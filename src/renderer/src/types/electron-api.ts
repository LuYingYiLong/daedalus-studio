/**
 * Electron API 类型定义
 */

export interface DiskSpaceInfo {
  drive: string;
  free: number;    // bytes
  total: number;   // bytes
}

export interface PackageInfo {
  name: string;
  version: string;
  description: string;
  license: string;
  author: string;
}

export interface ElectronAPI {
  checkDiskSpace: (driveLetter: string) => Promise<DiskSpaceInfo | null>;
  appInfo: {
    getPackageInfo: () => Promise<PackageInfo>;
  };
  // ... 其他已有的 API 定义
}
