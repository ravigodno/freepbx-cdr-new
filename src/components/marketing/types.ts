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

export interface CalltrackingPhoneNumber {
  id: string;
  siteId: string;
  phoneLabel: string;
  phoneDisplay: string;
  phoneHref: string;
  did?: string | null;
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type CalltrackingReplacementMatchType = 'utm_source' | 'utm_medium' | 'utm_campaign' | 'referrer' | 'landing_page' | 'default';

export interface CalltrackingReplacementRule {
  id: string;
  siteId: string;
  ruleName: string;
  priority: number;
  matchType: CalltrackingReplacementMatchType | string;
  matchValue: string;
  phoneNumberId: string;
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
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
  matchConfidenceScore?: number | null;
  matchReason?: string;
  matchExplanation?: string;
  matchedAt?: string | null;
  candidateCount?: number | null;
  matchedCallUniqueid?: string | null;
  matchedCallUniqueId?: string | null;
  matchedLinkedid?: string | null;
  matchedLinkedId?: string | null;
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
  callStatus?: 'answered' | 'missed' | 'lost' | 'unknown' | string;
}


export interface MarketingAggregateSummary {
  visits: number;
  pageviews: number;
  adImpressions: number;
  adClicks: number;
  adCost: number | null;
  phoneImpressions: number;
  phoneClicks: number;
  formSubmits: number;
  whatsappClicks: number;
  telegramClicks: number;
  emailClicks: number;
  matchedCalls: number;
  answeredCalls: number;
  missedCalls: number;
  lostCalls: number;
  callbackCalls: number;
  costPerCall?: number | null;
  costPerAnsweredCall?: number | null;
  costPerLostCall?: number | null;
  lostBudgetEstimate?: number | null;
}

export interface MarketingAggregateStatus {
  lastRebuildAt?: string | null;
  lastDateFrom?: string | null;
  lastDateTo?: string | null;
  lastSiteId?: string | null;
  lastError?: string | null;
  rows?: number;
}

export interface MarketingAggregatesResponse {
  rows: unknown[];
  sources: TrafficSourceSummary[];
  summary: MarketingAggregateSummary;
  total: number;
  status?: MarketingAggregateStatus | null;
  period?: { dateFrom: string; dateTo: string };
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
  pbxpulsPhoneClicks?: number;
  metrikaPhoneGoalConversions?: number;
  phoneClickDataGap?: number;
  phoneClickWarning?: string | null;
  metrikaGoalPartialErrors?: Array<{ integrationId?: string; siteId?: string; counterId?: string; error: string }>;
}

export interface YandexMetrikaPhoneGoalSummaryItem {
  integrationId: string;
  siteId: string;
  siteName?: string | null;
  domain?: string | null;
  counterId: string;
  phoneClickGoalId: string;
  phoneClickGoalName?: string | null;
  goalConversions: number;
  visitsWithGoal: number;
  source: 'yandex_metrika' | string;
}

export interface YandexMetrikaPhoneGoalSummaryResponse {
  items: YandexMetrikaPhoneGoalSummaryItem[];
  totalGoalConversions: number;
  partialErrors: Array<{ integrationId?: string; siteId?: string; counterId?: string; error: string }>;
}

export interface YandexMetrikaPhoneGoalEventRow {
  date: string;
  dateTime?: string | null;
  exactTimeAvailable?: boolean;
  timeGranularity?: 'exact' | 'minute' | 'daily' | 'aggregated' | string;
  siteId?: string | null;
  domain?: string | null;
  counterId?: string | null;
  goalId: string;
  goalName?: string | null;
  source: 'yandex_metrika_goal' | string;
  conversions: number;
  page?: string | null;
  ymClientId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}

export interface YandexMetrikaPhoneGoalEventsResponse {
  rows: YandexMetrikaPhoneGoalEventRow[];
  granularity: 'aggregated' | string;
  note: string;
  partialErrors: Array<{ integrationId?: string; siteId?: string; counterId?: string; error: string }>;
}

export interface YandexDirectSettings {
  enabled: boolean;
  clientLogins: string[];
  lastSyncAt?: string | null;
  lastError?: string | null;
}

export interface YandexDirectSummary {
  status: 'connected' | 'connected_limited' | 'connected_no_data' | 'not_configured' | 'disabled' | 'error' | string;
  lastError: string | null;
  summary: {
    cost: number | null;
    clicks: number | null;
    avgCpc: number | null;
    campaigns: number;
    directVisits?: number | null;
    warning?: string | null;
    noData?: boolean;
  };
  warning?: string | null;
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
  leadFormGoalId?: string | null;
}

export interface YandexMetrikaGoal {
  id: string;
  name: string;
  type?: string | null;
  isRetargeting?: boolean | null;
  status?: string | null;
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
  lastGoalsSyncAt?: string | null;
  lastGoalsError?: string | null;
  disconnectedAt?: string | null;
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
