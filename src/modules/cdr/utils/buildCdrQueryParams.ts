type BuildCdrQueryParamsInput = {
  page?: number;
  limit?: number;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  statusFilter: string;
  searchQuery: string;
  numberFilter: string;
  isDemoModeActive: boolean;
  myExt: string;
  onlyMyCalls: boolean;
  relatedMissedCallId?: string;
};

function parseExactCdrNumberSearch(value: unknown): string {
  const raw = String(value || '').trim();
  const match = raw.match(/^(?:=|ext:)(\d{2,8})$/i);
  return match ? match[1] : '';
}

export function buildCdrQueryParams(input: BuildCdrQueryParamsInput) {
  const exactNumberSearch = parseExactCdrNumberSearch(input.searchQuery);

  const params: Record<string, string> = {
    demo: input.isDemoModeActive ? 'true' : 'false',
    startDate: input.startDate,
    endDate: input.endDate,
    startTime: input.startTime,
    endTime: input.endTime,
    status: input.statusFilter,
    search: exactNumberSearch ? '' : input.searchQuery,
    number: exactNumberSearch || input.numberFilter,
    operatorExt: input.myExt,
    onlyMyCalls: input.onlyMyCalls ? 'true' : 'false'
  };

  if (input.relatedMissedCallId) {
    params.relatedMissedCallId = input.relatedMissedCallId;
  }

  if (input.page !== undefined) {
    params.page = String(input.page);
  }

  if (input.limit !== undefined) {
    params.limit = String(input.limit);
  }

  return new URLSearchParams(params);
}
