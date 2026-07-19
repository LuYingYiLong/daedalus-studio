/**
 * Electron API 类型定义
 */

export interface DiskSpaceInfo {
  drive: string;
  free: number;    // bytes
  total: number;   // bytes
}

export interface ElectronAPI {
  checkDiskSpace: (driveLetter: string) => Promise<DiskSpaceInfo | null>;
  // ... 其他已有的 API 定义
}
