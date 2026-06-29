export interface MarketingOverviewSummary {
  visits: number | null;
  phoneClicks: number | null;
  siteCalls: number | null;
  clickToCallConversion: number | null;
  missedSiteCalls: number | null;
  lostLeads: number | null;
  adCost: number | null;
  lostBudgetEstimate: number | null;
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
}

export interface TrafficSourceSummary {
  source: string;
  medium: string;
  campaign: string;
  visits: number;
  phoneClicks: number;
  formSubmits: number;
  calls?: number;
  answeredCalls?: number;
  missedCalls?: number;
  lostCalls?: number;
  matchRate?: number;
  clickToCallConversion?: number;
  cost?: number | null;
  costPerCall?: number | null;
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
  lostSiteCalls?: number;
  matchRate?: number;
  clickToCallConversion?: number;
  averageSecondsToCall?: number | null;
}
