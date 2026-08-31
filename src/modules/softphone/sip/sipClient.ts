import { Invitation, Inviter, Registerer, RegistererState, Session, SessionState, UserAgent } from 'sip.js';
import type { AudioDevicePreferences } from '../audio/audioDevicePreferences';

export type SoftphoneRegistrationState = 'offline' | 'connecting' | 'registered' | 'failed';
export type SoftphoneCallState = 'idle' | 'incoming' | 'connecting' | 'ringing' | 'active' | 'held' | 'ending' | 'failed';

export interface SipRuntimeConfiguration {
  websocketUrl: string;
  sipUri: string;
  authorizationUsername: string;
  authorizationPassword: string;
  displayName?: string;
}

export interface SoftphoneSnapshot {
  registration: SoftphoneRegistrationState;
  call: SoftphoneCallState;
  remoteNumber: string;
  direction: 'incoming' | 'outgoing' | null;
  muted: boolean;
  error: string;
}

type Listener = (snapshot: SoftphoneSnapshot) => void;
type WebSessionDescriptionHandler = { peerConnection?: RTCPeerConnection };

const INITIAL_SNAPSHOT: SoftphoneSnapshot = {
  registration: 'offline', call: 'idle', remoteNumber: '', direction: null, muted: false, error: ''
};

export class PbxPulsSipClient {
  private userAgent: UserAgent | null = null;
  private registerer: Registerer | null = null;
  private session: Session | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private snapshot: SoftphoneSnapshot = { ...INITIAL_SNAPSHOT };
  private listeners = new Set<Listener>();
  private audioPreferences: AudioDevicePreferences | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): SoftphoneSnapshot {
    return this.snapshot;
  }

  setAudioPreferences(preferences: AudioDevicePreferences): void {
    this.audioPreferences = preferences;
    void this.applyOutputDevice();
  }

  async connect(configuration: SipRuntimeConfiguration): Promise<void> {
    await this.disconnect();
    this.update({ registration: 'connecting', error: '' });
    const uri = UserAgent.makeURI(configuration.sipUri);
    if (!uri) throw new Error('Некорректный SIP URI');
    this.userAgent = new UserAgent({
      uri,
      displayName: configuration.displayName,
      authorizationUsername: configuration.authorizationUsername,
      authorizationPassword: configuration.authorizationPassword,
      transportOptions: { server: configuration.websocketUrl },
      logBuiltinEnabled: false,
      delegate: {
        onInvite: invitation => this.handleIncoming(invitation)
      }
    });
    this.registerer = new Registerer(this.userAgent);
    this.registerer.stateChange.addListener(state => {
      if (state === RegistererState.Registered) this.update({ registration: 'registered', error: '' });
      if (state === RegistererState.Unregistered || state === RegistererState.Terminated) this.update({ registration: 'offline' });
    });
    try {
      await this.userAgent.start();
      await this.registerer.register();
    } catch (error: any) {
      this.update({ registration: 'failed', error: error?.message || 'Не удалось зарегистрировать гарнитуру' });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.hangup().catch(() => undefined);
    if (this.registerer) await this.registerer.unregister().catch(() => undefined);
    if (this.userAgent) await this.userAgent.stop().catch(() => undefined);
    this.registerer = null;
    this.userAgent = null;
    this.releaseRemoteAudio();
    this.snapshot = { ...INITIAL_SNAPSHOT };
    this.emit();
  }

  async call(target: string): Promise<void> {
    if (!this.userAgent || this.snapshot.registration !== 'registered') throw new Error('Гарнитура не зарегистрирована на АТС');
    if (this.session) throw new Error('Другой звонок уже активен');
    const domain = this.userAgent.configuration.uri.host;
    const targetUri = UserAgent.makeURI(`sip:${target}@${domain}`);
    if (!targetUri) throw new Error('Некорректный номер назначения');
    const inviter = new Inviter(this.userAgent, targetUri, {
      sessionDescriptionHandlerOptions: { constraints: { audio: this.audioConstraints(), video: false } }
    });
    this.bindSession(inviter, 'outgoing', target);
    this.update({ call: 'connecting' });
    await inviter.invite({ requestDelegate: { onProgress: () => this.update({ call: 'ringing' }) } });
  }

  async answer(): Promise<void> {
    if (!(this.session instanceof Invitation) || this.snapshot.call !== 'incoming') throw new Error('Нет входящего звонка для ответа');
    this.update({ call: 'connecting' });
    await this.session.accept({ sessionDescriptionHandlerOptions: { constraints: { audio: this.audioConstraints(), video: false } } });
  }

  async reject(): Promise<void> {
    if (!(this.session instanceof Invitation)) return;
    await this.session.reject();
    this.clearSession();
  }

  async hangup(): Promise<void> {
    const current = this.session;
    if (!current) return;
    this.update({ call: 'ending' });
    if (current.state === SessionState.Initial || current.state === SessionState.Establishing) {
      if (current instanceof Inviter) await current.cancel();
      else if (current instanceof Invitation) await current.reject();
    } else if (current.state === SessionState.Established) {
      await current.bye();
    }
    this.clearSession();
  }

  setMuted(muted: boolean): void {
    const connection = this.peerConnection();
    connection?.getSenders().forEach(sender => {
      if (sender.track?.kind === 'audio') sender.track.enabled = !muted;
    });
    this.update({ muted });
  }

  async sendDtmf(tone: string): Promise<void> {
    if (!/^[0-9*#ABCD]$/i.test(tone) || this.snapshot.call !== 'active') return;
    const sender = this.peerConnection()?.getSenders().find(item => item.track?.kind === 'audio');
    if (!sender?.dtmf) throw new Error('Этот браузер или кодек не поддерживает DTMF');
    sender.dtmf.insertDTMF(tone, 160, 80);
  }

  private handleIncoming(invitation: Invitation): void {
    if (this.session) {
      void invitation.reject({ statusCode: 486 });
      return;
    }
    const remoteNumber = invitation.remoteIdentity.uri.user || invitation.remoteIdentity.displayName || 'Неизвестный номер';
    this.bindSession(invitation, 'incoming', remoteNumber);
    this.update({ call: 'incoming' });
  }

  private bindSession(session: Session, direction: 'incoming' | 'outgoing', remoteNumber: string): void {
    this.session = session;
    this.update({ direction, remoteNumber, muted: false, error: '' });
    session.stateChange.addListener(state => {
      if (state === SessionState.Established) {
        this.attachRemoteAudio();
        this.update({ call: 'active' });
      }
      if (state === SessionState.Terminated) this.clearSession();
    });
  }

  private attachRemoteAudio(): void {
    const connection = this.peerConnection();
    if (!connection) return;
    this.releaseRemoteAudio();
    const stream = new MediaStream();
    connection.getReceivers().forEach(receiver => { if (receiver.track) stream.addTrack(receiver.track); });
    const audio = new Audio();
    audio.autoplay = true;
    audio.srcObject = stream;
    this.remoteAudio = audio;
    void this.applyOutputDevice().then(() => audio.play()).catch(() => undefined);
  }

  private async applyOutputDevice(): Promise<void> {
    if (!this.remoteAudio || !this.audioPreferences?.speakerId || this.audioPreferences.speakerId === 'default') return;
    const audio = this.remoteAudio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (audio.setSinkId) await audio.setSinkId(this.audioPreferences.speakerId);
  }

  private audioConstraints(): MediaTrackConstraints | true {
    const preferences = this.audioPreferences;
    if (!preferences) return true;
    return {
      deviceId: preferences.microphoneId !== 'default' ? { exact: preferences.microphoneId } : undefined,
      echoCancellation: preferences.echoCancellation,
      noiseSuppression: preferences.noiseSuppression,
      autoGainControl: preferences.autoGainControl
    };
  }

  private peerConnection(): RTCPeerConnection | undefined {
    return (this.session?.sessionDescriptionHandler as WebSessionDescriptionHandler | undefined)?.peerConnection;
  }

  private clearSession(): void {
    this.session = null;
    this.releaseRemoteAudio();
    this.update({ call: 'idle', remoteNumber: '', direction: null, muted: false });
  }

  private releaseRemoteAudio(): void {
    if (!this.remoteAudio) return;
    this.remoteAudio.pause();
    const stream = this.remoteAudio.srcObject as MediaStream | null;
    stream?.getTracks().forEach(track => track.stop());
    this.remoteAudio.srcObject = null;
    this.remoteAudio = null;
  }

  private update(patch: Partial<SoftphoneSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach(listener => listener(this.snapshot));
  }
}
