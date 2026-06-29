export interface MarketingOverviewSummary {
  visits: number | null;
  phoneClicks: number | null;
  siteCalls: number | null;
  clickToCallConversion: number | null;
  missedSiteCalls: number | null;
  lostLeads: number | null;
  adCost: number | null;
  adClicks?: number | null;
  avgCpc?: number | null;
  costPerCall?: number | null;
  costPerAnsweredCall?: number | null;
  lostBudgetEstimate: number | null;
}

export interface UsedCallQualitySettings {
  answerSlaSeconds: number;
  missedCallCallbackSlaHours: number;
  calltrackingMatchWindowMinutes: number;
}

export interface CalltrackingSite {
  id: string;
  name: string;
  domain: string;
  publicKey: string;
  counterId?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PhoneClickEvent {
  id?: string;
  eventId?: string;
  eventTime: string;
  siteId?: string;
  siteName?: string;
  siteNameFallback?: string;
  pageUrl: string;
  referrer?: string;
  phoneText: string;
  phoneHref?: string;
  ymClientId: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  matchStatus?: 'matched' | 'unmatched' | 'ambiguous' | string;
  matchConfidence?: 'high' | 'medium' | 'low' | 'none' | string;
  matchReason?: string;
  matchedCallUniqueid?: string | null;
  matchedLinkedid?: string | null;
  matchedCallDate?: string | null;
  matchedExternalNumber?: string | null;
  matchedDestinationNumber?: string | null;
  matchedDisposition?: string | null;
  matchedDuration?: number | null;
  matchedBillsec?: number | null;
  matchedRecordingFile?: string | null;
  responsibleExtension?: string | null;
  secondsToCall?: number | null;
  callbackStatus?: 'not_required' | 'called_back' | 'not_called_back' | 'unknown' | string;
  callbackCallUniqueid?: string | null;
  callbackCallDate?: string | null;
  callbackSecondsAfterMissed?: number | null;
  callbackDisposition?: string | null;
  callbackBillsec?: number | null;
  leadStatus?: 'answered' | 'recovered_by_callback' | 'lost' | 'unmatched' | 'ambiguous' | string;
}

export interface TrafficSourceSummary {
  source: string;
  medium: string;
  campaign: string;
  visits: number;
  users?: number;
  bounceRate?: number | null;
  avgVisitDurationSeconds?: number | null;
  phoneClicks: number;
  formSubmits: number;
  calls?: number;
  answeredCalls?: number;
  missedCalls?: number;
  lostCalls?: number;
  recoveredByCallback?: number;
  notCalledBack?: number;
  trueLostLeads?: number;
  callbackRecoveryRate?: number;
  matchRate?: number;
  clickToCallConversion?: number;
  cost?: number | null;
  directClicks?: number | null;
  avgCpc?: number | null;
  costPerCall?: number | null;
  costPerAnsweredCall?: number | null;
  costPerLostLead?: number | null;
  lostBudgetEstimate?: number | null;
}

export interface CampaignSummary {
  campaignName: string;
  impressions: number;
  clicks: number;
  cost: number;
  phoneClicks: number;
  calls: number;
  answeredCalls: number;
  lostCalls: number;
  costPerCall: number;
  lostBudgetEstimate: number;
}

export interface LostLead {
  source: string;
  campaign: string;
  pageUrl: string;
  clickTime: string;
  callTime: string;
  phoneNumber: string;
  status: string;
  responsibleName: string;
  lostBudgetEstimate: number;
}

export interface CalltrackingSummaryResponse {
  visits: number;
  pageViews: number;
  phoneImpressions: number;
  phoneClicks: number;
  formSubmits: number;
  whatsappClicks: number;
  telegramClicks: number;
  emailClicks: number;
  uniqueSessions: number;
  siteCalls?: number;
  matchedCalls?: number;
  answeredSiteCalls?: number;
  missedSiteCalls?: number;
  preliminaryLostSiteCalls?: number;
  lostSiteCalls?: number;
  trueLostLeads?: number;
  recoveredByCallback?: number;
  notCalledBack?: number;
  callbackRecoveryRate?: number;
  matchRate?: number;
  clickToCallConversion?: number;
  averageSecondsToCall?: number | null;
  averageCallbackSeconds?: number | null;
}

export interface YandexDirectSettings {
  enabled: boolean;
  clientLogins: string[];
  lastSyncAt?: string | null;
  lastError?: string | null;
}

export interface YandexDirectSummary {
  status: 'connected' | 'not_configured' | 'disabled' | 'error' | string;
  lastError: string | null;
  summary: {
    cost: number | null;
    clicks: number | null;
    avgCpc: number | null;
    campaigns: number;
  };
}

export interface YandexDirectSourceRow {
  source: string;
  medium: string;
  campaignId?: string | null;
  campaignName: string;
  clicks: number | null;
  cost: number | null;
  currency?: string | null;
  avgCpc: number | null;
}

export interface YandexMetrikaGoals {
  phoneClickGoalId?: string | null;
  whatsappClickGoalId?: string | null;
  telegramClickGoalId?: string | null;
  emailClickGoalId?: string | null;
}

export interface YandexMetrikaCounter {
  counterId: string;
  name: string;
  domain?: string | null;
  status?: string | null;
}

export interface YandexMetrikaIntegration {
  id: string;
  siteId: string;
  counterId: string;
  domain?: string | null;
  name: string;
  tokenStatus: 'not_checked' | 'valid' | 'invalid' | 'error' | string;
  isActive: boolean;
  lastSyncAt?: string | null;
  lastError?: string | null;
  goals?: YandexMetrikaGoals | null;
  direct?: YandexDirectSettings | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface YandexMetrikaSummary {
  visits: number;
  users: number;
  pageViews: number;
  bounceRate: number | null;
  avgVisitDurationSeconds: number | null;
  phoneClickGoals: number | null;
  whatsappClickGoals: number | null;
  telegramClickGoals: number | null;
  emailClickGoals: number | null;
  goalsConfigured?: boolean;
}

export interface YandexMetrikaSourceSummary {
  source: string;
  medium: string;
  campaign: string | null;
  visits: number;
  users: number;
  bounceRate: number | null;
  avgVisitDurationSeconds: number | null;
}

export interface YandexMetrikaPageSummary {
  pageUrl: string;
  visits: number;
  users: number;
  pageViews: number;
  phoneClicks: number;
}
