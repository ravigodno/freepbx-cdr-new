export type TrunkLabTechnology = 'pjsip' | 'chan_sip' | 'unknown';
export type TrunkLabRiskLevel = 'ok' | 'warning' | 'critical' | 'unknown';
export type TrunkLabRegistrationStatus = 'registered' | 'rejected' | 'auth_failed' | 'timeout' | 'no_registration' | 'unavailable' | 'unknown';
export type TrunkLabEndpointStatus = 'available' | 'unavailable' | 'not_in_use' | 'unreachable' | 'unknown';
export type TrunkLabContactStatus = 'reachable' | 'nonqual' | 'unreachable' | 'no_contact' | 'unknown';
export type TrunkLabSourceState = 'ok' | 'unavailable' | 'error' | 'timeout';

export type TrunkDiagnostic = {
  id: string;
  name: string;
  technology: TrunkLabTechnology;
  source: string;
  registrationStatus: TrunkLabRegistrationStatus;
  endpointStatus: TrunkLabEndpointStatus;
  contactStatus: TrunkLabContactStatus;
  authStatus: 'available' | 'missing' | 'unavailable' | 'unknown';
  networkStatus: TrunkLabRiskLevel;
  riskLevel: TrunkLabRiskLevel;
  summary: string;
  problems: string[];
  recommendations: string[];
  rawRefs: Record<string, string>;
  templateSuggestion?: string;
  rawPeerName?: string;
  displayName?: string;
  notes?: string[];
  trunkid?: string | number;
  tech?: string;
  channelId?: string;
  outcid?: string;
  disabled?: boolean;
  registryUsername?: string;
  registryHost?: string;
  peerHost?: string;
  peerPort?: string;
  rtt?: string;
};

export type TrunkLabCommandResult = {
  command: string;
  success: boolean;
  output: string;
  status: TrunkLabSourceState;
  message?: string;
};

export type TrunkLabResponse = {
  success: boolean;
  generatedAt?: string;
  diagnostics: TrunkDiagnostic[];
  pjsip?: Record<string, TrunkLabCommandResult>;
  chansip?: Record<string, TrunkLabCommandResult>;
  sourceStatus?: Record<string, { status: TrunkLabSourceState; message?: string; command?: string }>;
  inventory?: Array<{ trunkid: string | number; name: string; tech: string; channelId: string; outcid: string; disabled: boolean }>; 
  summary: {
    total: number;
    registered: number;
    problems: number;
    pjsip: number;
    chanSip: number;
    unreachable: number;
    unknown: number;
    pjsipRegistrations?: number;
    sourceWarnings?: number;
  };
  error?: string;
  message?: string;
};

export type TrunkLabFiltersState = {
  search: string;
  technology: 'all' | 'pjsip' | 'chan_sip';
  risk: 'all' | TrunkLabRiskLevel;
  registration: 'all' | TrunkLabRegistrationStatus;
};

export type TrunkLabTestType = 'trunk_lab_registration_test' | 'trunk_lab_peer_test' | 'trunk_lab_outbound_call_test';

export type TrunkLabTestResult = {
  id: string;
  trunkId?: string | number;
  trunkName: string;
  testType: TrunkLabTestType;
  timestamp: string;
  status: string;
  riskLevel: TrunkLabRiskLevel;
  summary: string;
  problems: string[];
  recommendations: string[];
  raw?: Record<string, unknown>;
  uniqueid?: string;
  linkedid?: string;
  result?: Record<string, unknown>;
};

export type TrunkLabTestResponse = {
  success: boolean;
  type: TrunkLabTestType;
  generatedAt: string;
  trunk?: Record<string, unknown>;
  result?: Record<string, unknown> & { riskLevel?: TrunkLabRiskLevel; summary?: string; uniqueid?: string; linkedid?: string };
  problems?: string[];
  recommendations?: string[];
  raw?: Record<string, unknown>;
  error?: string;
  message?: string;
};
