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

  // Transfer tracking
  wasTransferred?: boolean;
  transferTargetExt?: string;
  transferTargetLabel?: string;
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
  moduleVisibility?: {
    marketing?: boolean;
    monitoring?: boolean;
    management?: boolean;
    balance?: boolean;
    scripts?: boolean;
    ai_assistant?: boolean;
    ai_pbx_admin?: boolean;
  };
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
  freepbxApiWorkingEndpoint?: string;
  freepbxExtensionProvider?: 'auto' | 'bmo' | 'graphql' | 'database' | 'legacy-rest';
  
  // AMI / Click-to-Call Settings
  amiHost?: string;
  amiPort?: number;
  amiUser?: string;
  amiPass?: string;
  amiContext?: string;

  // Auto-Resolution Settings (KPI Callback timeframe in minutes)
  callbackKpiMinutes?: number;

  // Call quality and lead attribution settings
  answerSlaSeconds?: number;
  missedCallCallbackSlaHours?: number;
  calltrackingMatchWindowMinutes?: number;

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
  directoryImportEnabled?: boolean;
  googleImportEnabled?: boolean;
  fileImportEnabled?: boolean;
  yandexCarddavEnabled?: boolean;
  mailruCarddavEnabled?: boolean;
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

  // Custom Design Settings
  customLogoUrl?: string;
  customCopyright?: string;
}

export interface DashboardStats {
  inboundCalls: number;
  outboundCalls: number;
  internalCalls: number;
  missedCalls: number;
  processedCalls: number;
  lostCalls: number;
}

export type DirectoryContactType = 'internal' | 'client' | 'supplier' | 'government';
export type DirectoryVisibility = 'shared' | 'private';

export interface DirectoryEntry {
  id: string;
  name: string;
  number: string;              // primary phone/ext, kept for backward compatibility
  phones?: string[];           // all phones/exts attached to one contact
  type: DirectoryContactType;
  visibility?: DirectoryVisibility;
  ownerUserId?: string | null;
  company?: string;
  position?: string;
  department?: string;
  group?: string;
  email?: string;
  website?: string;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  address?: string;
  internalExtension?: string;
  linkedExternalNumber?: string;
  responsibleUserId?: string;
  tags?: string[];
  isSpam?: boolean;
  isBlacklisted?: boolean;
  comment?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ContactSyncDirection = 'import_only' | 'export_only' | 'two_way';
export type ContactSyncConflictStrategy = 'manual_review' | 'pbxpuls_wins' | 'external_wins' | 'latest_update_wins';

export interface ContactSyncAccount {
  id: string;
  userId: string;
  provider: 'google' | 'yandex' | 'mailru' | 'file';
  status: 'connected' | 'disconnected' | 'error' | 'not_configured';
  authType: 'oauth' | 'carddav' | 'file';
  externalAccountEmail?: string | null;
  carddavUrl?: string | null;
  scopes?: string[] | string | null;
  expiresAt?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  syncDirection?: ContactSyncDirection;
  conflictStrategy?: ContactSyncConflictStrategy;
  createdAt?: string;
  updatedAt?: string;
}

export interface ContactSyncMapping {
  id: string;
  contactId: string;
  userId: string;
  provider: 'google' | 'yandex' | 'mailru' | 'file';
  externalContactId: string;
  lastSyncedAt?: string | null;
  syncDirection: ContactSyncDirection;
  externalUpdatedAt?: string | null;
  localUpdatedAt?: string | null;
  conflictStrategy: ContactSyncConflictStrategy;
  createdAt?: string;
  updatedAt?: string;
}

export type CallScriptType = 'inbound' | 'outbound' | 'internal' | 'universal';
export type CallScriptStatus = 'draft' | 'active' | 'archive';

export interface CallScript {
  id: string;
  title: string;
  description?: string;
  type: CallScriptType;
  status: CallScriptStatus;
  department?: string;
  queue?: string;
  didNumber?: string;
  operators?: string[]; // IDs or extensions
  innerNumbers?: string;
  isRequired?: boolean;
  language?: string;
  tags?: string[];
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  version?: number; // current active version number
}

export interface CallScriptNode {
  id: string;
  type: 'operator_text' | 'question' | 'choice' | 'objection' | 'hint' | 'checklist' | 'input_field' | 'finish';
  title: string;
  text?: string;
  required?: boolean;
  next?: string;
  
  // Field-specific settings:
  answerType?: 'text' | 'number' | 'phone' | 'list' | 'date' | 'boolean';
  options?: { label: string; next: string }[];
  objectionType?: 'expensive' | 'think' | 'has_provider' | 'not_interested' | 'no_time' | 'send_info' | 'callback_later';
  arguments?: string; // arguments for objection
  importance?: 'normal' | 'important' | 'critical';
  checklistItems?: { id: string; text: string; checkedByDefault?: boolean }[];
  inputFieldName?: string; // FIO, phone, email, etc.
  inputFieldType?: string;
  resultType?: 'success' | 'consultation' | 'refusal' | 'callback' | 'not_target' | 'wrong_number' | 'resolved' | 'transfer';
  commentRequired?: boolean;
  taskRequired?: boolean;
  callbackRequired?: boolean;
  color?: string;
  hintText?: string;
}

export interface CallScriptSchema {
  nodes: CallScriptNode[];
}

export interface CallScriptVersion {
  id: string;
  scriptId: string;
  versionNumber: number;
  schemaJson: string; // JSON string of CallScriptSchema
  createdBy?: string;
  createdAt?: string;
  comment?: string;
  isActive: boolean;
}

export interface CallScriptRun {
  id: string;
  scriptId: string;
  scriptVersionId: string;
  callUniqueid?: string;
  callLinkedid?: string;
  operatorExtension?: string;
  operatorName?: string;
  clientPhone?: string;
  queue?: string;
  didNumber?: string;
  startedAt: string;
  finishedAt?: string;
  durationSec?: number;
  completed: boolean;
  result?: string;
  comment?: string;
}

export interface CallScriptRunStep {
  id: string;
  runId: string;
  stepId: string;
  stepTitle: string;
  stepType: string;
  answerValue?: string;
  selectedOption?: string;
  startedAt: string;
  completedAt?: string;
  skipped: boolean;
  comment?: string;
}

export interface CallScriptAssignment {
  id: string;
  scriptId: string;
  priority: number;
  callType?: CallScriptType;
  queue?: string;
  didNumber?: string;
  department?: string;
  operatorExtension?: string;
  workingHours?: string;
  isActive: boolean;
}

