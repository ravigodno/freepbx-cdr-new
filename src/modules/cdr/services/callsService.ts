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

export async function fetchCalls(params: FetchCallsParams) {
  const qParams = new URLSearchParams({
    page: params.page.toString(),
    limit: params.limit.toString(),
    startDate: params.startDate,
    endDate: params.endDate,
    startTime: params.startTime,
    endTime: params.endTime,
    status: params.statusFilter,
    search: params.searchQuery,
    number: params.numberFilter,
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
  const qParams = new URLSearchParams({
    demo: params.isDemoModeActive ? 'true' : 'false',
    startDate: params.startDate,
    endDate: params.endDate,
    startTime: params.startTime,
    endTime: params.endTime,
    status: params.statusFilter,
    search: params.searchQuery,
    number: params.numberFilter,
    operatorExt: params.operatorExt,
    onlyMyCalls: params.onlyMyCalls ? 'true' : 'false'
  });

  return fetch(`/api/stats?${qParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${params.token}`
    }
  });
}
