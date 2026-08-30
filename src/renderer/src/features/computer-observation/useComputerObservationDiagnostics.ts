import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ComputerObservation,
  ComputerSource,
} from "../../../../contracts/computer-observation";
import { useComputerState } from "./useComputerState";

export function useComputerObservationDiagnostics() {
  const { api, state } = useComputerState();
  const generation = useRef(0);
  const [open, setOpen] = useState(false);
  const [observation, setObservation] = useState<ComputerObservation | null>(
    null,
  );
  const load = useCallback(
    (): Promise<ComputerSource[]> =>
      api ? api.listDiagnostics() : Promise.resolve([]),
    [api],
  );
  const close = useCallback(() => {
    generation.current++;
    setOpen(false);
    setObservation(null);
    void api?.closeDiagnostics().catch(() => {});
  }, [api]);
  const openPicker = useCallback(() => setOpen(true), []);
  const choose = useCallback(
    async (sourceId: string): Promise<void> => {
      if (!api) return;
      const current = generation.current;
      const result = await api.diagnose(sourceId);
      if (current !== generation.current) return;
      setObservation(result);
    },
    [api],
  );

  useEffect(
    () => () => {
      generation.current++;
      // 设置窗口销毁时 Main 也会清理；迟到的 IPC 错误不能成为未处理 rejection
      void api?.closeDiagnostics().catch(() => {});
    },
    [api],
  );
  useEffect(() => {
    if (state?.diagnosticsBlocked) close();
  }, [state?.diagnosticsBlocked, close]);

  return { api, state, open, openPicker, observation, load, close, choose };
}
