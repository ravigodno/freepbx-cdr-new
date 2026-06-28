import { Building2, GitBranch, Hash, LayoutDashboard, MapPinned, PhoneForwarded, Settings, UserPlus, Wifi } from 'lucide-react';
import { ui } from '../../../locales/ru';

export type ManagementSectionId = 'overview' | 'extensions' | 'departments' | 'operator-templates' | 'trunks' | 'outbound-routes' | 'inbound-routes' | 'dial-patterns' | 'number-ranges';

export type ManagementSection = {
  id: ManagementSectionId;
  label: string;
  description: string;
  status: 'ready' | 'foundation' | 'planned';
  roadmap: string;
  icon: any;
};

export const MANAGEMENT_SECTIONS: ManagementSection[] = [
  { id: 'overview', label: ui.management.overview, description: ui.management.sections.overviewDescription, status: 'foundation', roadmap: ui.management.sections.roadmapFoundation, icon: LayoutDashboard },
  { id: 'extensions', label: ui.management.extensions, description: ui.management.sections.extensionsDescription, status: 'ready', roadmap: ui.management.sections.roadmapExtensionsComplete, icon: UserPlus },
  { id: 'departments', label: ui.management.departments, description: ui.management.sections.departmentsDescription, status: 'planned', roadmap: ui.management.sections.roadmapDepartments, icon: Building2 },
  { id: 'operator-templates', label: ui.management.operatorTemplates, description: ui.management.sections.operatorTemplatesDescription, status: 'foundation', roadmap: ui.management.sections.roadmapOperatorTemplates, icon: Settings },
  { id: 'trunks', label: ui.management.trunks, description: ui.management.sections.trunksDescription, status: 'planned', roadmap: ui.management.sections.roadmapTrunks, icon: Wifi },
  { id: 'outbound-routes', label: ui.management.outboundRoutes, description: ui.management.sections.outboundRoutesDescription, status: 'planned', roadmap: ui.management.sections.roadmapRoutes, icon: PhoneForwarded },
  { id: 'inbound-routes', label: ui.management.inboundRoutes, description: ui.management.sections.inboundRoutesDescription, status: 'planned', roadmap: ui.management.sections.roadmapInboundRoutes, icon: MapPinned },
  { id: 'dial-patterns', label: ui.management.dialPatterns, description: ui.management.sections.dialPatternsDescription, status: 'planned', roadmap: ui.management.sections.roadmapDialPatterns, icon: GitBranch },
  { id: 'number-ranges', label: ui.management.numberRanges, description: ui.management.sections.numberRangesDescription, status: 'foundation', roadmap: ui.management.sections.roadmapNumberRanges, icon: Hash }
];
