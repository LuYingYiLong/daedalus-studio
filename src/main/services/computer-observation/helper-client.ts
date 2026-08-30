import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { COMPUTER_MAX_MESSAGE_BYTES } from "../../../contracts/computer-observation";

export interface ComputerHelper {
  request(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  stop(): void;
}
export async function verifyComputerResources(
  directory: string,
): Promise<void> {
  const manifest = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  );
  if (
    manifest.protocolVersion !== 1 ||
    !manifest.files ||
    typeof manifest.files !== "object"
  )
    throw new Error("computer_resources_invalid");
  for (const name of [
    "daedalus-computer-helper.exe",
    "onnxruntime.dll",
    "det.onnx",
    "rec.onnx",
    "msvcp140.dll",
    "msvcp140_1.dll",
    "vcruntime140.dll",
    "vcruntime140_1.dll",
  ]) {
    if (!manifest.files[name]) throw new Error("computer_resources_missing");
  }
  for (const [name, expected] of Object.entries(manifest.files) as [
    string,
    { sha256: string; byteSize: number },
  ][]) {
    if (!/^[\w.-]+$/.test(name)) throw new Error("computer_resources_invalid");
    const bytes = await readFile(join(directory, name));
    if (
      bytes.length !== expected.byteSize ||
      createHash("sha256").update(bytes).digest("hex") !== expected.sha256
    )
      throw new Error("computer_resources_invalid");
  }
}
export class NativeComputerHelper implements ComputerHelper {
  private process: ChildProcessWithoutNullStreams | null = null;
  private startPromise: Promise<void> | null = null;
  private buffer = Buffer.alloc(0);
  private generation = 0;
  private pending = new Map<
    string,
    {
      resolve(value: Record<string, unknown>): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(private readonly directory: string) {}
  private async start(): Promise<void> {
    if (this.process) return;
    if (this.startPromise) return this.startPromise;
    const generation = this.generation;
    this.startPromise = (async () => {
      try {
        await verifyComputerResources(this.directory);
      } catch {
        throw new Error("computer_resources_invalid");
      }
      if (generation !== this.generation) throw new Error("computer_cancelled");
      const child = spawn(
        join(this.directory, "daedalus-computer-helper.exe"),
        ["--parent", String(process.pid), "--resources", this.directory],
        { windowsHide: true, stdio: "pipe", cwd: this.directory },
      );
      this.process = child;
      child.stdout.on("data", (bytes: Buffer) => {
        if (this.process === child) this.consume(bytes);
      });
      // 不记录原生异常正文，避免第三方库把窗口文字或路径写入日志
      child.stderr.on("data", () => {});
      child.stdin.on("error", () => {
        if (this.process === child) this.stop();
      });
      child.on("error", () => {
        if (this.process === child) this.stop();
      });
      child.on("exit", () => {
        if (this.process === child) this.stop();
      });
    })().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }
  async request(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    await this.start();
    if (!this.process) throw new Error("computer_helper_stopped");
    if (this.pending.size) throw new Error("computer_busy");
    const id = randomUUID();
    const body = Buffer.from(
      JSON.stringify({ version: 1, id, method, params }),
    );
    if (body.length > 16384) throw new Error("computer_invalid_request");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stop("computer_timeout");
      }, 20_000);
      this.pending.set(id, { resolve, reject, timer });
      this.process?.stdin.write(Buffer.concat([header, body]));
    });
  }
  private consume(bytes: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, bytes]);
    if (this.buffer.length > COMPUTER_MAX_MESSAGE_BYTES + 4)
      return this.stop("computer_result_too_large");
    while (this.buffer.length >= 4) {
      const size = this.buffer.readUInt32LE(0);
      if (!size || size > COMPUTER_MAX_MESSAGE_BYTES)
        return this.stop("computer_protocol_invalid");
      if (this.buffer.length < size + 4) return;
      try {
        const result = JSON.parse(
          this.buffer.subarray(4, size + 4).toString("utf8"),
        );
        this.buffer = this.buffer.subarray(size + 4);
        const pending = this.pending.get(result.id);
        if (!pending || result.version !== 1 || typeof result.ok !== "boolean")
          return this.stop("computer_protocol_invalid");
        clearTimeout(pending.timer);
        this.pending.delete(result.id);
        if (
          result.ok &&
          result.result &&
          typeof result.result === "object" &&
          !Array.isArray(result.result)
        )
          pending.resolve(result.result);
        else
          pending.reject(
            new Error(
              typeof result.error === "string" &&
                /^computer_[a-z_]+$/.test(result.error)
                ? result.error
                : "computer_native_failed",
            ),
          );
      } catch {
        return this.stop("computer_protocol_invalid");
      }
    }
  }
  stop(code = "computer_helper_stopped"): void {
    this.generation++;
    const child = this.process;
    this.process = null;
    this.buffer = Buffer.alloc(0);
    child?.kill();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(code));
    }
    this.pending.clear();
  }
}
