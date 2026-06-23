export async function fetchCdrStats(params: URLSearchParams, token: string) {
  const resp = await fetch(`/api/stats?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (resp.status === 401) {
    throw new Error('UNAUTHORIZED');
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let errorMessage = 'Не удалось загрузить статистику вызовов';
    try {
      const parsed = JSON.parse(text);
      if (parsed.error) {
        errorMessage = parsed.error;
      }
    } catch {
      if (text && text.includes('Rate exceeded')) {
        errorMessage = 'Превышен лимит запросов к серверу. Пожалуйста, подождите немного.';
      } else if (text) {
        errorMessage = text.slice(0, 100);
      }
    }
    throw new Error(errorMessage);
  }

  try {
    return await resp.json();
  } catch (e) {
    throw new Error('Некорректный формат ответа статистики от сервера');
  }
}

export async function fetchCdrCalls(params: URLSearchParams, token: string) {
  const resp = await fetch(`/api/calls?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (resp.status === 401) {
    throw new Error('UNAUTHORIZED');
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let errorMessage = 'Не удалось загрузить реестр вызовов';
    try {
      const parsed = JSON.parse(text);
      if (parsed.error) {
        errorMessage = parsed.error;
      }
    } catch {
      if (text && text.includes('Rate exceeded')) {
        errorMessage = 'Превышен лимит запросов к серверу. Пожалуйста, подождите немного.';
      } else if (text) {
        errorMessage = text.slice(0, 100);
      }
    }
    throw new Error(errorMessage);
  }

  try {
    return await resp.json();
  } catch (e) {
    throw new Error('Некорректный формат ответа вызовов от сервера');
  }
}

