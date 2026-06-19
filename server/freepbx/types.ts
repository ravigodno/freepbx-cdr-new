export type CallDirection = 'inbound' | 'outbound' | 'internal' | 'unknown';

export type FreepbxRouteTraceStep = {
  type: string;
  title: string;
  label: string;
  number?: string;
  destination?: string;
  pattern?: string;
  cidPattern?: string;
  error?: string;
  details?: any;
  members?: any[];
};

export type FreepbxRouteTraceResult = {
  did: string;
  direction: CallDirection;
  answeredExt?: string;
  steps: FreepbxRouteTraceStep[];
};

export type QueryFreePBXCDR = (
  settings: any,
  isDemo: boolean,
  sql: string,
  params?: any[]
) => Promise<any[]>;
