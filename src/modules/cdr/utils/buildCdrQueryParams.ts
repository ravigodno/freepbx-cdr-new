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
};

export function buildCdrQueryParams(input: BuildCdrQueryParamsInput) {
  const params: Record<string, string> = {
    demo: input.isDemoModeActive ? 'true' : 'false',
    startDate: input.startDate,
    endDate: input.endDate,
    startTime: input.startTime,
    endTime: input.endTime,
    status: input.statusFilter,
    search: input.searchQuery,
    number: input.numberFilter,
    operatorExt: input.myExt,
    onlyMyCalls: input.onlyMyCalls ? 'true' : 'false'
  };

  if (input.page !== undefined) {
    params.page = String(input.page);
  }

  if (input.limit !== undefined) {
    params.limit = String(input.limit);
  }

  return new URLSearchParams(params);
}
