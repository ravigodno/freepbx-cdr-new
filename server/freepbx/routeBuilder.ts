export {
  detectCallDirection,
  getAnsweredExtFromLegs,
} from './callDetection';

export {
  extractExtFromChannel,
  getRealCallerExtFromCall,
  isOutboundCall,
  extractDialedExtsFromLastdata,
} from './utils';

export {
  analyzeRingGroups,
} from './ringGroupTracer';

export {
  analyzeOutboundRoute,
} from './outboundTracer';

export function extractRingGroupIdsFromLegs(legs: any[]): string[] {
  return Array.from(new Set(
    legs
      .filter((l: any) => l.dcontext === 'ext-group' && l.dst)
      .map((l: any) => String(l.dst))
  ));
}
