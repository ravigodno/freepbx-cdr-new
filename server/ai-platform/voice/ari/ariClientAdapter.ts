import { createRequire } from 'node:module';
import fetch from 'node-fetch';
import type { AriConfig, AriEventHandler, AriHealth } from './ariTypes.js';
import { VoiceGatewayError } from '../voiceGatewayErrors.js';

const WebSocketClient: any = createRequire(`${process.cwd()}/package.json`)('ws');

export interface AriClientAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getHealth(): AriHealth;
  subscribe(handler: AriEventHandler): void;
  unsubscribe(handler: AriEventHandler): void;
  onDisconnect?(handler: () => void): void;
  getChannel(id: string): Promise<unknown>;
  answerChannel(id: string): Promise<void>;
  hangupChannel(id: string): Promise<void>;
  continueChannel(id: string): Promise<void>;
  getBridge(id: string): Promise<unknown>;
  createBridge(id: string): Promise<void>;
  addChannelToBridge(bridgeId: string, channelId: string): Promise<void>;
  destroyBridge(id: string): Promise<void>;
  createAudioSocketChannel(input: { channelId: string; app: string; externalHost: string; connectionId: string }): Promise<void>;
  listApplications(): Promise<unknown[]>;
}

const safeUrl = (value: string, protocols: string[]) => {
  let url: URL;
  try { url = new URL(value); } catch { throw new VoiceGatewayError('provider_not_configured', 503, 'ARI endpoint is invalid'); }
  if (!protocols.includes(url.protocol) || url.username || url.password) throw new VoiceGatewayError('provider_not_configured', 503, 'ARI endpoint is invalid');
  return url;
};

export class ObserverAriClientAdapter implements AriClientAdapter {
  private socket: any = null;
  private handlers = new Set<AriEventHandler>();
  private disconnectHandlers = new Set<() => void>();
  private health: AriHealth;

  constructor(private readonly config: AriConfig) {
    this.health = { state: config.configured ? 'disconnected' : 'not_configured', connectedAt: null, lastErrorCode: null };
  }

  getHealth() { return { ...this.health }; }
  subscribe(handler: AriEventHandler) { this.handlers.add(handler); }
  unsubscribe(handler: AriEventHandler) { this.handlers.delete(handler); }
  onDisconnect(handler: () => void) { this.disconnectHandlers.add(handler); }

  private async request(path: string, method = 'GET') {
    if (!this.config.configured) throw new VoiceGatewayError('provider_not_configured', 503, 'ARI is not configured');
    const base = safeUrl(this.config.baseUrl, ['http:', 'https:']);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
      const response = await fetch(new URL(path, base).toString(), { method, headers: { Authorization: `Basic ${auth}` }, signal: controller.signal as any });
      if (!response.ok) throw new VoiceGatewayError('ari_request_failed', 502, 'ARI request failed');
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      if (error instanceof VoiceGatewayError) throw error;
      throw new VoiceGatewayError(error instanceof Error && error.name === 'AbortError' ? 'ari_timeout' : 'ari_connection_failed', 502, 'ARI request failed');
    } finally { clearTimeout(timer); }
  }

  async connect() {
    if (!this.config.configured) throw new VoiceGatewayError('provider_not_configured', 503, 'ARI is not configured');
    if (this.socket && [WebSocketClient.OPEN, WebSocketClient.CONNECTING].includes(this.socket.readyState)) return;
    const url = safeUrl(this.config.webSocketUrl, ['ws:', 'wss:']);
    url.searchParams.set('app', this.config.application);
    url.searchParams.set('api_key', `${this.config.username}:${this.config.password}`);
    this.health = { ...this.health, state: 'connecting' };
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = new WebSocketClient(url.toString());
      this.socket = socket;
      const fail = () => {
        this.health = { ...this.health, state: 'failed', lastErrorCode: 'ari_connection_failed' };
        if (!settled) { settled = true; reject(new VoiceGatewayError('ari_connection_failed', 502, 'ARI connection failed')); }
      };
      socket.once('open', () => { settled = true; this.health = { state: 'connected', connectedAt: new Date().toISOString(), lastErrorCode: null }; resolve(); });
      socket.on('message', (data: unknown) => { try { const event = JSON.parse(String(data)); for (const handler of this.handlers) void handler(event); } catch {} });
      socket.once('error', fail);
      socket.once('close', () => { this.socket = null; this.health = { ...this.health, state: 'disconnected' }; if (!settled) fail(); else for (const handler of this.disconnectHandlers) handler(); });
    });
  }

  async disconnect() {
    const socket = this.socket;
    this.socket = null;
    if (socket && ![WebSocketClient.CLOSED, WebSocketClient.CLOSING].includes(socket.readyState)) await new Promise<void>(resolve => { socket.once('close', resolve); socket.close(); setTimeout(resolve, 500).unref(); });
    this.health = { ...this.health, state: this.config.configured ? 'disconnected' : 'not_configured' };
  }

  getChannel(id: string) { return this.request(`/ari/channels/${encodeURIComponent(id)}`); }
  getBridge(id: string) { return this.request(`/ari/bridges/${encodeURIComponent(id)}`); }
  listApplications() { return this.request('/ari/applications'); }
  answerChannel(id: string) { return this.request(`/ari/channels/${encodeURIComponent(id)}/answer`, 'POST').then(() => {}); }
  hangupChannel(id: string) { return this.request(`/ari/channels/${encodeURIComponent(id)}`, 'DELETE').then(() => {}); }
  continueChannel(id: string) { return this.request(`/ari/channels/${encodeURIComponent(id)}/continue`, 'POST').then(() => {}); }
  createBridge(id: string) { return this.request(`/ari/bridges?type=mixing&bridgeId=${encodeURIComponent(id)}`, 'POST').then(() => {}); }
  addChannelToBridge(bridgeId: string, channelId: string) { return this.request(`/ari/bridges/${encodeURIComponent(bridgeId)}/addChannel?channel=${encodeURIComponent(channelId)}`, 'POST').then(() => {}); }
  destroyBridge(id: string) { return this.request(`/ari/bridges/${encodeURIComponent(id)}`, 'DELETE').then(() => {}); }
  createAudioSocketChannel(input: { channelId: string; app: string; externalHost: string; connectionId: string }) {
    const query = new URLSearchParams({ app: input.app, external_host: input.externalHost, format: 'slin', transport: 'tcp', encapsulation: 'audiosocket', connection_type: 'client', direction: 'both', channelId: input.channelId, data: input.connectionId });
    return this.request(`/ari/channels/externalMedia?${query}`, 'POST').then(() => {});
  }
}

export class SyntheticAriClientAdapter implements AriClientAdapter {
  private handlers = new Set<AriEventHandler>(); private connected = false; readonly operations: string[] = [];
  connect = async () => { this.connected = true; }; disconnect = async () => { this.connected = false; };
  getHealth = () => ({ state: this.connected ? 'connected' : 'disconnected', connectedAt: this.connected ? new Date().toISOString() : null, lastErrorCode: null } as AriHealth);
  subscribe = (handler: AriEventHandler) => { this.handlers.add(handler); }; unsubscribe = (handler: AriEventHandler) => { this.handlers.delete(handler); };
  onDisconnect = (_handler:()=>void) => {};
  emit = async (event: unknown) => { for (const handler of this.handlers) await handler(event); };
  getChannel = async () => ({}); getBridge = async () => ({}); listApplications = async () => [];
  answerChannel = async () => { this.operations.push('answer'); }; hangupChannel = async () => { this.operations.push('hangup'); }; continueChannel = async () => { this.operations.push('continue'); };
  createBridge = async () => { this.operations.push('bridge:create'); }; addChannelToBridge = async () => { this.operations.push('bridge:add'); }; destroyBridge = async () => { this.operations.push('bridge:destroy'); }; createAudioSocketChannel = async () => { this.operations.push('audiosocket:create'); };
}
