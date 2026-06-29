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

export interface PhoneClickEvent {
  eventTime: string;
  siteName: string;
  pageUrl: string;
  phoneText: string;
  ymClientId: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  matchStatus: string;
}

export interface TrafficSourceSummary {
  source: string;
  medium: string;
  visits: number;
  phoneClicks: number;
  calls: number;
  answeredCalls: number;
  missedCalls: number;
  lostCalls: number;
  conversionRate: number;
  cost: number;
  costPerCall: number;
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
