import { useEffect, useState } from 'react';
import { notification } from 'antd';

/**
 * 磁盘空间检测 Hook
 * 在应用启动时检测 %USERPROFILE%\.daedalus 所在盘符的磁盘空间
 * 如果小于 1GiB 则显示通知提示用户
 */
export function useDiskSpaceCheck() {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // 异步检测磁盘空间，避免阻塞应用启动
    const checkDiskSpace = async () => {
      try {
        // 延迟执行，确保应用已完全启动
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 在 Electron 主进程中检查磁盘空间
        const result = await window.electronAPI.checkDiskSpace();

        if (!result) {
          console.warn('Failed to check disk space');
          return;
        }

        // 转换为 GiB
        const freeSpaceGiB = result.free / (1024 ** 3);

        // 检查是否小于 1GiB
        if (freeSpaceGiB < 1) {
          notification.warning({
            message: 'Low Disk Space',
            description: `The disk containing your Daedalus data has less than 1 GiB of free space remaining (${freeSpaceGiB.toFixed(2)} GiB available). To ensure a smooth experience, please free up some disk space.`,
            duration: 0, // 不自动关闭
            placement: 'topRight',
          });
        }

        console.log(`Disk space check completed: ${freeSpaceGiB.toFixed(2)} GiB free on drive ${result.drive}`);
      } catch (error) {
        console.error('Error checking disk space:', error);
      } finally {
        setChecked(true);
      }
    };

    checkDiskSpace();
  }, []);

  return { checked };
}
