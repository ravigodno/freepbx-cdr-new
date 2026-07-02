export type FetchCallsParams = {
  token: string;
  page: number;
  limit: number;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  statusFilter: string;
  searchQuery: string;
  numberFilter: string;
  isDemoModeActive: boolean;
  operatorExt: string;
  onlyMyCalls: boolean;
};

type ExactCdrSearchMode = 'any' | 'from' | 'to';

function parseExactCdrSearch(value: unknown): { mode: ExactCdrSearchMode; number: string } | null {
  const raw = String(value || '').trim();

  const anyMatch = raw.match(/^(?:=|ext:)(\d{2,8})$/i);
  if (anyMatch) return { mode: 'any', number: anyMatch[1] };

  const fromMatch = raw.match(/^from:(\d{2,8})$/i);
  if (fromMatch) return { mode: 'from', number: fromMatch[1] };

  const toMatch = raw.match(/^to:(\d{2,8})$/i);
  if (toMatch) return { mode: 'to', number: toMatch[1] };

  return null;
}

function buildExactSearchParams(searchQuery: string, numberFilter: string) {
  const exact = parseExactCdrSearch(searchQuery);

  return {
    search: exact ? '' : searchQuery,
    number: exact?.mode === 'any' ? exact.number : numberFilter,
    fromExt: exact?.mode === 'from' ? exact.number : '',
    toExt: exact?.mode === 'to' ? exact.number : ''
  };
}

export async function fetchCalls(params: FetchCallsParams) {
  const exactParams = buildExactSearchParams(params.searchQuery, params.numberFilter);

  const qParams = new URLSearchParams({
    page: params.page.toString(),
    limit: params.limit.toString(),
    startDate: params.startDate,
    endDate: params.endDate,
    startTime: params.startTime,
    endTime: params.endTime,
    status: params.statusFilter,
    search: exactParams.search,
    number: exactParams.number,
    fromExt: exactParams.fromExt,
    toExt: exactParams.toExt,
    demo: params.isDemoModeActive ? 'true' : 'false',
    operatorExt: params.operatorExt,
    onlyMyCalls: params.onlyMyCalls ? 'true' : 'false'
  });

  return fetch(`/api/calls?${qParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${params.token}`
    }
  });
}

export type FetchStatsParams = {
  token: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  statusFilter: string;
  searchQuery: string;
  numberFilter: string;
  isDemoModeActive: boolean;
  operatorExt: string;
  onlyMyCalls: boolean;
};

export async function fetchStats(params: FetchStatsParams) {
  const exactParams = buildExactSearchParams(params.searchQuery, params.numberFilter);

  const qParams = new URLSearchParams({
    demo: params.isDemoModeActive ? 'true' : 'false',
    startDate: params.startDate,
    endDate: params.endDate,
    startTime: params.startTime,
    endTime: params.endTime,
    status: params.statusFilter,
    search: exactParams.search,
    number: exactParams.number,
    fromExt: exactParams.fromExt,
    toExt: exactParams.toExt,
    operatorExt: params.operatorExt,
    onlyMyCalls: params.onlyMyCalls ? 'true' : 'false'
  });

  return fetch(`/api/stats?${qParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${params.token}`
    }
  });
}
