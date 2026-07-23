import { fork, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import type { MediaWorkerEnvelope } from "./mediaWorkerProtocol.js";

type Handler = (event: MediaWorkerEnvelope) => void;
const MAX_PENDING_BYTES = 16 * 1024 * 1024;

class MediaWorkerClient {
  private child: ChildProcess | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private requests = new Map<string, (event: MediaWorkerEnvelope) => void>();
  private pendingBytes = 0;
  private restartCount = 0;
  private lastHeartbeat: number | null = null;
  private health: Record<string, unknown> = { state: "stopped" };

  async start() {
    if (this.child?.connected) return;
    const workerPath = path.resolve(
      process.cwd(),
      "server/ai-platform/voice/media-worker/mediaWorkerProcess.cjs",
    );
    const child = fork(workerPath, [], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      serialization: "advanced",
    });
    this.child = child;
    child.on("message", (message) => this.receive(message as MediaWorkerEnvelope));
    child.on("exit", () => {
      if (this.child === child) {
        this.child = null;
        this.health = { state: "failed", restartCount: ++this.restartCount };
      }
    });
    await this.request({ version: 1, type: "health_check" }, 3000);
  }

  private receive(event: MediaWorkerEnvelope) {
    if (!event || event.version !== 1) return;
    if (event.type === "health_status") {
      this.lastHeartbeat = Date.now();
      this.health = {
        ...(event.payload as object),
        lastHeartbeat: this.lastHeartbeat,
        restartCount: this.restartCount,
        ipcBytesPending: this.pendingBytes,
      };
    }
    if (event.request_id) {
      const resolve = this.requests.get(event.request_id);
      if (resolve) {
        this.requests.delete(event.request_id);
        resolve(event);
      }
    }
    if (event.session_ref)
      for (const handler of this.handlers.get(event.session_ref) || [])
        handler(event);
  }

  subscribe(sessionRef: string, handler: Handler) {
    const set = this.handlers.get(sessionRef) || new Set<Handler>();
    set.add(handler);
    this.handlers.set(sessionRef, set);
    return () => {
      set.delete(handler);
      if (!set.size) this.handlers.delete(sessionRef);
    };
  }

  async request(message: Omit<MediaWorkerEnvelope, "request_id">, timeoutMs = 5000) {
    await this.ensure();
    const requestId = crypto.randomUUID();
    return new Promise<MediaWorkerEnvelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requests.delete(requestId);
        reject(new Error("media_worker_timeout"));
      }, timeoutMs);
      timer.unref?.();
      this.requests.set(requestId, (event) => {
        clearTimeout(timer);
        resolve(event);
      });
      this.send({ ...message, request_id: requestId });
    });
  }

  send(message: MediaWorkerEnvelope) {
    if (!this.child?.connected) throw new Error("media_worker_unavailable");
    const bytes = this.size(message);
    if (this.pendingBytes + bytes > MAX_PENDING_BYTES)
      throw new Error("media_worker_backpressure");
    this.pendingBytes += bytes;
    this.child.send(message, (error) => {
      this.pendingBytes = Math.max(0, this.pendingBytes - bytes);
      if (error) this.health = { ...this.health, state: "failed" };
    });
  }

  private size(message: MediaWorkerEnvelope) {
    const frames = (message.payload as any)?.frames;
    return Array.isArray(frames)
      ? frames.reduce((sum, frame) => sum + (frame.pcm?.byteLength || 0), 0)
      : 256;
  }

  private async ensure() {
    if (!this.child?.connected) await this.start();
  }

  getHealth() {
    return { ...this.health, ipcBytesPending: this.pendingBytes };
  }

  async shutdown() {
    if (!this.child?.connected) return;
    try {
      await this.request({ version: 1, type: "shutdown" }, 1000);
    } catch {}
    this.child?.kill();
    this.child = null;
    this.handlers.clear();
    this.requests.clear();
  }
}

export const mediaWorkerClient = new MediaWorkerClient();
export const startMediaWorker = () => mediaWorkerClient.start();
export const stopMediaWorker = () => mediaWorkerClient.shutdown();
