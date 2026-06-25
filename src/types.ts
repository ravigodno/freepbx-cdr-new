export type UserRole = 'su' | 'admin' | 'manager' | 'operator' | 'directory_only' | 'custom';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  extension?: string;
  disabled?: boolean;
  permissions?: Record<string, boolean>;
  createdAt?: string;
  updatedAt?: string;
}

export interface WebUser extends User {
  passwordHash: string;
}

export interface CallEntry {
  uniqueid: string;
  calldate: string; // YYYY-MM-DD HH:mm:ss
  clid: string;     // Caller ID string
  src: string;      // Caller number
  dst: string;      // Callee extension / DID
  dcontext: string;
  channel: string;
  dstchannel: string;
  lastapp: string;
  lastdata: string;
  duration: number; // in seconds
  billsec: number;  // billable duration in seconds
  disposition: 'ANSWERED' | 'NO ANSWER' | 'BUSY' | 'FAILED' | string;
  recordingfile: string;
  did: string;
  
  // FreePBX additions
  cnum?: string;
  cnam?: string;
  outbound_cnum?: string;
  linkedid?: string;
  
  // Appends from our local DB
  processed?: boolean;
  processedBy?: string;
  processedAt?: string;
  comment?: string;
  
  // Contact resolution appends
  resolvedName?: string;
  resolvedType?: 'internal' | 'client';

  // Callback tracking flags
  wasCallbacked?: boolean;     // Was this client called back or did they call back successfully?
  callbackCallId?: string;     // UniqueId of the call that resolved this
  callbackTime?: string;       // Time of the callback resolution
  wasKpiResolved?: boolean;    // Was resolved within the KPI timeframe?
}

export interface MissedCallStatus {
  uniqueid: string;
  src: string;
  calldate: string;
  processed: boolean;
  processedBy: string;
  processedAt: string; // ISO String
  comment: string;
}

export interface AppSettings {
  showSuRoleToAdmin?: boolean;
  showSuPermissionsToAdmin?: boolean;
  allowAdminEditSuPermissions?: boolean;
  recordingsPath: string;
  recordingsUrlPrefix: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPass: string;
  demoMode?: boolean;
  
  // AMI / Click-to-Call Settings
  amiHost?: string;
  amiPort?: number;
  amiUser?: string;
  amiPass?: string;
  amiContext?: string;

  // Auto-Resolution Settings (KPI Callback timeframe in minutes)
  callbackKpiMinutes?: number;

  // FreePBX REST API Settings
  freepbxApiUrl?: string;
  freepbxApiToken?: string;
  freepbxApiClientId?: string;
  freepbxApiClientSecret?: string;

  // Phone Normalization Settings
  normEnabled?: boolean;
  normReplace8With7?: boolean;
  normStripSymbols?: boolean;
  normDigitsOnly?: boolean;

  // Directory import / synchronization settings
  directoryImportUrl?: string;
  directoryImportFormat?: 'csv' | 'json';
  directoryImportMode?: 'append' | 'upsert' | 'overwrite';
  directoryImportSchedule?: 'manual' | 'hourly' | 'daily' | 'weekly';
  directorySyncToken?: string;
  directorySyncAsteriskBlacklist?: boolean;
  directoryLastSyncAt?: string;
  directoryLastSyncStatus?: string;
  directoryLastSyncMessage?: string;

  // Permissions Matrix for Customizable ('custom') Role
  customCanViewCalls?: boolean;
  customCanViewDirectory?: boolean;
  customCanViewReports?: boolean;
  customCanListenRecordings?: boolean;
  customCanMakeCalls?: boolean;
  customCanEditDirectory?: boolean;
}

export interface DashboardStats {
  inboundCalls: number;
  outboundCalls: number;
  internalCalls: number;
  missedCalls: number;
  processedCalls: number;
  lostCalls: number;
}

export interface DirectoryEntry {
  id: string;
  name: string;
  number: string;              // primary phone/ext, kept for backward compatibility
  phones?: string[];           // all phones/exts attached to one contact
  type: 'internal' | 'client' | 'supplier' | 'government';
  company?: string;
  position?: string;
  department?: string;
  email?: string;
  website?: string;
  tags?: string[];
  isSpam?: boolean;
  isBlacklisted?: boolean;
  comment?: string;
  createdAt?: string;
  updatedAt?: string;
}

