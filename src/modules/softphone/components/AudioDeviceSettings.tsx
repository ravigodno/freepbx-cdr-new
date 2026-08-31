import React, { useEffect, useRef, useState } from 'react';
import { Headphones, Loader2, Mic, Play, RefreshCw, ShieldAlert, Volume2 } from 'lucide-react';
import { loadAudioDevicePreferences, saveAudioDevicePreferences, type AudioDevicePreferences } from '../audio/audioDevicePreferences';

type DeviceLists = { inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] };

const emptyDevices: DeviceLists = { inputs: [], outputs: [] };

const deviceLabel = (device: MediaDeviceInfo, index: number, kind: 'Микрофон' | 'Устройство') => device.label || `${kind} ${index + 1}`;

export default function AudioDeviceSettings() {
  const [preferences, setPreferences] = useState<AudioDevicePreferences>(loadAudioDevicePreferences);
  const [devices, setDevices] = useState<DeviceLists>(emptyDevices);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [testingOutput, setTestingOutput] = useState(false);
  const [level, setLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);

  const update = (patch: Partial<AudioDevicePreferences>) => {
    setPreferences(current => {
      const next = { ...current, ...patch };
      saveAudioDevicePreferences(next);
      return next;
    });
  };

  const refreshDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMessage('Этот браузер не поддерживает выбор аудиоустройств. Используйте актуальный Chrome или Edge по HTTPS.');
      return;
    }
    const list = await navigator.mediaDevices.enumerateDevices();
    setDevices({ inputs: list.filter(item => item.kind === 'audioinput'), outputs: list.filter(item => item.kind === 'audiooutput') });
  };

  const stopMicrophoneTest = () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setLevel(0);
  };

  const startMicrophoneTest = async () => {
    setLoading(true);
    setMessage('');
    stopMicrophoneTest();
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Для микрофона откройте PBXPuls по HTTPS.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        deviceId: preferences.microphoneId && preferences.microphoneId !== 'default' ? { exact: preferences.microphoneId } : undefined,
        echoCancellation: preferences.echoCancellation,
        noiseSuppression: preferences.noiseSuppression,
        autoGainControl: preferences.autoGainControl
      }, video: false });
      streamRef.current = stream;
      setPermission('granted');
      await refreshDevices();
      const context = new AudioContext();
      audioContextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const values = new Uint8Array(analyser.frequencyBinCount);
      const measure = () => {
        analyser.getByteFrequencyData(values);
        const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
        setLevel(Math.min(100, Math.round(average * 1.7)));
        animationRef.current = requestAnimationFrame(measure);
      };
      measure();
      setMessage('Микрофон активен. Скажите несколько слов и проверьте индикатор.');
    } catch (error: any) {
      setPermission(error?.name === 'NotAllowedError' ? 'denied' : 'unknown');
      setMessage(error?.message || 'Не удалось получить доступ к микрофону.');
    } finally {
      setLoading(false);
    }
  };

  const testOutput = async () => {
    setTestingOutput(true);
    setMessage('');
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      oscillator.frequency.value = 520;
      gain.gain.value = 0.12;
      oscillator.connect(gain).connect(destination);
      const audio = new Audio();
      audio.srcObject = destination.stream;
      const sinkAudio = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (preferences.speakerId !== 'default') {
        if (!sinkAudio.setSinkId) throw new Error('Выбор устройства вывода не поддерживается этим браузером.');
        await sinkAudio.setSinkId(preferences.speakerId);
      }
      await audio.play();
      oscillator.start();
      oscillator.stop(context.currentTime + 0.7);
      await new Promise(resolve => window.setTimeout(resolve, 850));
      audio.pause();
      audio.srcObject = null;
      setMessage('Тестовый сигнал воспроизведён.');
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось воспроизвести тестовый сигнал.');
    } finally {
      if (context) await context.close().catch(() => undefined);
      setTestingOutput(false);
    }
  };

  useEffect(() => {
    void refreshDevices().catch(() => undefined);
    const handleChange = () => void refreshDevices().catch(() => undefined);
    navigator.mediaDevices?.addEventListener?.('devicechange', handleChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleChange);
      stopMicrophoneTest();
    };
  }, []);

  useEffect(() => {
    if (streamRef.current) void startMicrophoneTest();
  }, [preferences.microphoneId, preferences.echoCancellation, preferences.noiseSuppression, preferences.autoGainControl]);

  return <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h5 className="flex items-center gap-2 text-xs font-black text-slate-900"><Headphones className="h-4 w-4 text-blue-600" />Гарнитура и звук</h5>
        <p className="mt-1 text-[11px] text-slate-500">Устройства сохраняются только для этого браузера и компьютера.</p>
      </div>
      <button type="button" onClick={() => void refreshDevices()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" />Обновить</button>
    </div>

    {!window.isSecureContext && <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-800"><ShieldAlert className="h-4 w-4 shrink-0" />Настройка микрофона доступна только при открытии PBXPuls по HTTPS.</div>}

    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-xs font-semibold text-slate-700"><span className="flex items-center gap-1"><Mic className="h-3.5 w-3.5" />Микрофон</span><select value={preferences.microphoneId} onChange={event => update({microphoneId:event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2"><option value="default">Системный по умолчанию</option>{devices.inputs.filter(item => item.deviceId !== 'default').map((item, index) => <option key={item.deviceId} value={item.deviceId}>{deviceLabel(item, index, 'Микрофон')}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-700"><span className="flex items-center gap-1"><Volume2 className="h-3.5 w-3.5" />Звук разговора</span><select value={preferences.speakerId} onChange={event => update({speakerId:event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2"><option value="default">Системный по умолчанию</option>{devices.outputs.filter(item => item.deviceId !== 'default').map((item, index) => <option key={item.deviceId} value={item.deviceId}>{deviceLabel(item, index, 'Устройство')}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-700"><span className="flex items-center gap-1"><Volume2 className="h-3.5 w-3.5" />Сигнал входящего звонка</span><select value={preferences.ringtoneId} onChange={event => update({ringtoneId:event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2"><option value="default">Системный по умолчанию</option>{devices.outputs.filter(item => item.deviceId !== 'default').map((item, index) => <option key={item.deviceId} value={item.deviceId}>{deviceLabel(item, index, 'Устройство')}</option>)}</select></label>
    </div>

    <div className="grid gap-2 sm:grid-cols-3">
      {([['echoCancellation', 'Эхоподавление'], ['noiseSuppression', 'Шумоподавление'], ['autoGainControl', 'Автоусиление']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-[10px] font-bold text-slate-700"><input type="checkbox" checked={preferences[key]} onChange={event => update({[key]:event.target.checked})} className="h-4 w-4 accent-blue-600" />{label}</label>)}
    </div>

    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 transition-[width]" style={{width:`${level}%`}} /></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => streamRef.current ? stopMicrophoneTest() : void startMicrophoneTest()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}{streamRef.current ? 'Остановить микрофон' : 'Проверить микрофон'}</button>
        <button type="button" onClick={() => void testOutput()} disabled={testingOutput} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-700 disabled:opacity-50">{testingOutput ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}Проверить звук</button>
      </div>
    </div>
    {message && <div className={`text-[10px] font-semibold ${permission === 'denied' ? 'text-rose-600' : 'text-slate-600'}`}>{message}</div>}
  </div>;
}
