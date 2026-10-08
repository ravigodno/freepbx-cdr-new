export async function requestAudioDevices(media: Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices'>) {
  // Enumerate while permission and the temporary stream are active. Do not use a
  // saved deviceId here: unplugged devices must not prevent choosing a new one.
  const stream = await media.getUserMedia({ audio: true, video: false });
  try { return await media.enumerateDevices(); }
  finally { stream.getTracks().forEach(track => track.stop()); }
}

export function audioDeviceError(error: { name?: string; message?: string }) {
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'Разрешите микрофон для этого сайта в браузере и проверьте доступ к микрофону в настройках Windows. HTTPS-сертификат должен быть доверенным.';
  if (error.name === 'NotFoundError') return 'Браузер не обнаружил микрофон. Проверьте подключение и настройки звука компьютера.';
  if (error.name === 'NotReadableError') return 'Микрофон недоступен: проверьте драйвер и использование устройства другой программой.';
  if (error.name === 'OverconstrainedError') return 'Выбранный микрофон недоступен. Обновите список и выберите подключённое устройство.';
  return error.message || 'Не удалось получить список аудиоустройств.';
}
