export async function fetchCdrStats(params: URLSearchParams, token: string) {
  const resp = await fetch(`/api/stats?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (resp.status === 401) {
    throw new Error('UNAUTHORIZED');
  }

  return resp.json();
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
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.error || 'Не удалось загрузить реестр вызовов');
  }

  return resp.json();
}
