export async function fetchCdrStats(url: string, token: string) {
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (resp.status === 401) {
    throw new Error('UNAUTHORIZED');
  }

  return resp.json();
}

export async function fetchCdrCalls(url: string, token: string) {
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (resp.status === 401) {
    throw new Error('UNAUTHORIZED');
  }

  return resp.json();
}
