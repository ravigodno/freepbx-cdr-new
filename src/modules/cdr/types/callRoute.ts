export interface RouteMember {
  extension: string;
  name?: string;
  status?: string;
  outboundcid?: string;
  ringtimer?: string;
  noanswerDest?: string;
  busyDest?: string;
  unavailableDest?: string;
}

export interface RouteStep {
  label: string;
  title: string;
  number?: string;
  pattern?: string;
  destination?: string;
  members?: RouteMember[];
}

export interface RouteView {
  routeSteps: RouteStep[];
  resultText: string;
  anyAnswered: boolean;
}
