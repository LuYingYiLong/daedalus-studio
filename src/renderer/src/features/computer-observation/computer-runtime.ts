import {
  createBackendClient,
  onBackendConnectionStateChanged,
} from "@/platform/rpc/transport/backend-client";
import { getPlatformRuntime } from "@/platform/runtime/platform-runtime";
import {
  parseComputerRequest,
  type ComputerScope,
} from "../../../../contracts/computer-observation";

export function bindComputerRuntime(
  sessionId: string | null,
  workspaceId: string | null,
): () => void {
  const api = getPlatformRuntime().system?.computerObservation;
  if (!api) return () => {};
  let alive = true,
    revision = 0,
    connectionId: string | null = null;
  let disposeEvents: (() => void) | undefined;
  let sequence = 0,
    heartbeatBusy = false;
  let control:
    | import("../../../../contracts/computer-observation").ComputerControlState
    | null = null;
  const established = new Set<string>();
  const syncControl = async (): Promise<void> => {
    if (
      !alive ||
      heartbeatBusy ||
      !control ||
      control.connectionId !== connectionId ||
      !established.has(control.requestId)
    )
      return;
    heartbeatBusy = true;
    const {
      connectionId: owner,
      sessionId,
      requestId,
      runId,
      generation,
      state,
      code,
    } = control;
    const value = {
      connectionId: owner,
      sessionId,
      requestId,
      runId,
      generation,
      state,
      ...(code ? { code } : {}),
      sequence: ++sequence,
    };
    try {
      const client = await createBackendClient();
      if (client.isOpen()) {
        await client.request("computer.control.update", value);
        if (value.state !== "cancelled")
          await api.heartbeat({
            connectionId: value.connectionId,
            sessionId: value.sessionId,
            requestId: value.requestId,
            runId: value.runId,
          });
        if (value.state === "cancelled") {
          established.delete(value.requestId);
          await api.acknowledgeControl({
            connectionId: value.connectionId,
            sessionId: value.sessionId,
            requestId: value.requestId,
            runId: value.runId,
          });
        }
      }
    } catch {
      /* Backend heartbeat deadline independently stops the bound run */
    } finally {
      heartbeatBusy = false;
    }
  };
  const disposeState = api.onState((state) => {
    control = state.control ?? null;
    void syncControl();
  });
  const heartbeat = setInterval(() => void syncControl(), 1000);
  const disposeRevocations = api.onRevoked((value) => {
    // 原连接已断开时不在新连接上补报；Backend 自己记录断连撤销
    if (value.connectionId !== connectionId) return;
    void createBackendClient()
      .then((client) =>
        client.isOpen()
          ? client.request("computer.access.revoked", value)
          : undefined,
      )
      .then(() =>
        api.acknowledgeControl({
          connectionId: value.connectionId,
          sessionId: value.sessionId,
          requestId: value.requestId,
          runId: value.runId,
        }),
      )
      .catch(() => {});
  });
  const handled = new Set<string>();
  let ready = Promise.resolve();
  const refresh = (): void => {
    const current = ++revision;
    connectionId = null;
    ready = (async () => {
      await api.setContext(null);
      const client = await createBackendClient();
      const info = await client.request<{
        connection: { connectionId: string };
        features?: { computerControl?: number };
      }>("client.info");
      if (!alive || current !== revision) return;
      connectionId = info.connection.connectionId;
      await api.setContext({
        connectionId,
        sessionId,
        workspaceId,
        controlSupported: info.features?.computerControl === 2,
      });
    })().catch(() => {});
  };
  const disposeConnection = onBackendConnectionStateChanged((state) => {
    if (state === "disconnected") {
      revision++;
      connectionId = null;
      void api.setContext(null);
    } else refresh();
  });
  refresh();
  void createBackendClient()
    .then((client) => {
      if (!alive) return;
      disposeEvents = client.addEventListener((event) => {
        if (event.event === "computer.tool.cancel") {
          const data = event.data as
            | { callId?: string; control?: boolean; scope?: ComputerScope }
            | undefined;
          if (
            data?.control &&
            data.scope?.requestId === control?.requestId &&
            data.scope?.runId === control?.runId
          )
            void api.revoke().catch(() => {});
          if (data?.callId) void api.cancel(data.callId).catch(() => {});
          return;
        }
        if (event.sessionId !== sessionId) return;
        const runState =
          event.event === "agent.run.state" &&
          event.data &&
          typeof event.data === "object"
            ? (event.data as {
                stage?: string;
                rootRequestId?: string;
                requestId?: string;
                runId?: string;
              })
            : null;
        if (
          runState &&
          ["completed", "failed", "cancelled", "interrupted"].includes(
            runState.stage ?? "",
          ) &&
          connectionId &&
          runState.runId
        ) {
          void api
            .finish({
              connectionId,
              sessionId: sessionId!,
              requestId:
                runState.rootRequestId ??
                runState.requestId ??
                event.requestId!,
              runId: runState.runId,
            })
            .catch(() => {});
          return;
        }
        if (
          [
            "agent.run.done",
            "agent.run.error",
            "agent.run.cancelled",
            "plan.error",
          ].includes(event.event) &&
          connectionId &&
          event.requestId &&
          event.runId
        ) {
          void api
            .finish({
              connectionId,
              sessionId: sessionId!,
              requestId: event.requestId,
              runId: event.runId,
            } satisfies ComputerScope)
            .catch(() => {});
          return;
        }
        if (event.event !== "computer.tool.request") return;
        void (async () => {
          await ready;
          const request = parseComputerRequest(event.data);
          if (
            !alive ||
            request.connectionId !== connectionId ||
            handled.has(request.callId)
          )
            return;
          handled.add(request.callId);
          if (handled.size > 512)
            handled.delete(handled.values().next().value!);
          const generation = revision;
          try {
            const result = await api.execute(request);
            if (alive && generation === revision)
              await client.request("computer.tool.result", {
                callId: request.callId,
                ok: true,
                result,
              });
            if (result.mode === "control") {
              established.add(request.requestId);
              void syncControl();
            }
          } catch (error) {
            const code =
              error instanceof Error
                ? (error.message.match(/computer_[a-z_]+/)?.[0] ??
                  "computer_failed")
                : "computer_failed";
            if (alive && generation === revision && client.isOpen())
              await client.request("computer.tool.result", {
                callId: request.callId,
                ok: false,
                error: {
                  code,
                  message: code,
                  retryable: [
                    "computer_busy",
                    "computer_rate_limited",
                    "computer_observation_stale",
                  ].includes(code),
                },
              });
          }
        })().catch(() => {});
      });
    })
    .catch(() => {});
  return () => {
    alive = false;
    clearInterval(heartbeat);
    disposeState();
    revision++;
    disposeConnection();
    disposeEvents?.();
    void api
      .setContext(null)
      .catch(() => {})
      .finally(disposeRevocations);
  };
}
