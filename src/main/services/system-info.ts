import { ipcMain } from 'electron';
import { exec } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface DiskSpaceInfo {
  drive: string;
  free: number;
  total: number;
}

export interface PackageInfo {
  name: string;
  version: string;
  description: string;
  license: string;
  author: string;
}

/**
 * 注册系统信息相关的 IPC 处理器
 */
export function registerSystemInfoIpc(): void {
  // 检查磁盘空间
  ipcMain.handle('electron:checkDiskSpace', async (_event, driveLetter: string): Promise<DiskSpaceInfo | null> => {
    try {
      const platform = process.platform;

      if (platform === 'win32') {
        return await checkWindowsDiskSpace(driveLetter);
      } else if (platform === 'darwin') {
        return await checkMacDiskSpace();
      } else if (platform === 'linux') {
        return await checkLinuxDiskSpace();
      }

      return null;
    } catch (error) {
      console.error('Error checking disk space:', error);
      return null;
    }
  });

  // 获取应用 package.json 信息
  ipcMain.handle('app:get-package-info', async (): Promise<PackageInfo> => {
    try {
      const packagePath = join(__dirname, '../../package.json');
      const packageContent = await readFile(packagePath, 'utf-8');
      const packageJson = JSON.parse(packageContent);
      return {
        name: packageJson.name || 'Daedalus Studio',
        version: packageJson.version || '1.0.0',
        description: packageJson.description || '',
        license: packageJson.license || 'GPL-3.0-only',
        author: packageJson.author || 'LuYingYiLong'
      };
    } catch (error) {
      console.error('Failed to read package.json:', error);
      return {
        name: 'Daedalus Studio',
        version: '1.0.0',
        description: '',
        license: 'GPL-3.0-only',
        author: 'LuYingYiLong'
      };
    }
  });
}

/**
 * Windows 磁盘空间检测
 * 使用 PowerShell Get-Volume 命令
 */
async function checkWindowsDiskSpace(driveLetter: string): Promise<DiskSpaceInfo | null> {
  try {
    const drive = driveLetter.replace(':', '').toUpperCase();
    const command = `Get-Volume -DriveLetter ${drive} | Select-Object SizeRemaining, Size | ConvertTo-Json`;

    const { stdout } = await execAsync(`powershell -Command "${command}"`);

    const result = JSON.parse(stdout);

    if (!result || result.SizeRemaining === undefined || result.Size === undefined) {
      return null;
    }

    return {
      drive: `${drive}:`,
      free: result.SizeRemaining,
      total: result.Size,
    };
  } catch (error) {
    console.error('Windows disk space check failed:', error);
    return null;
  }
}

/**
 * macOS 磁盘空间检测
 * 使用 df 命令
 */
async function checkMacDiskSpace(): Promise<DiskSpaceInfo | null> {
  try {
    const { stdout } = await execAsync('df -H / | tail -1');

    const parts = stdout.trim().split(/\s+/);
    if (parts.length < 4) {
      return null;
    }

    // 解析 df 输出: Size, Used, Avail, Capacity, Mounted on
    const sizeStr = parts[1];
    const availStr = parts[3];

    const total = parseHumanReadableSize(sizeStr);
    const free = parseHumanReadableSize(availStr);

    if (total === null || free === null) {
      return null;
    }

    return {
      drive: '/',
      free,
      total,
    };
  } catch (error) {
    console.error('macOS disk space check failed:', error);
    return null;
  }
}

/**
 * Linux 磁盘空间检测
 * 使用 df 命令
 */
async function checkLinuxDiskSpace(): Promise<DiskSpaceInfo | null> {
  try {
    // 检测用户主目录所在分区
    const homeDir = process.env.HOME || '';
    if (!homeDir) {
      return null;
    }

    const { stdout } = await execAsync(`df -H "${homeDir}" | tail -1`);

    const parts = stdout.trim().split(/\s+/);
    if (parts.length < 4) {
      return null;
    }

    const sizeStr = parts[1];
    const availStr = parts[3];

    const total = parseHumanReadableSize(sizeStr);
    const free = parseHumanReadableSize(availStr);

    if (total === null || free === null) {
      return null;
    }

    return {
      drive: parts[0], // 设备路径
      free,
      total,
    };
  } catch (error) {
    console.error('Linux disk space check failed:', error);
    return null;
  }
}

/**
 * 解析人类可读的大小（如 "100G", "500M"）
 */
function parseHumanReadableSize(sizeStr: string): number | null {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)?([KMGTP]?)$/i);
  if (!match) {
    return null;
  }

  const value = parseFloat(match[1] || '0');
  const unit = (match[2] || '').toUpperCase();

  const multipliers: Record<string, number> = {
    '': 1,
    'K': 1024,
    'M': 1024 ** 2,
    'G': 1024 ** 3,
    'T': 1024 ** 4,
    'P': 1024 ** 5,
  };

  if (!(unit in multipliers)) {
    return null;
  }

  return value * multipliers[unit];
}
