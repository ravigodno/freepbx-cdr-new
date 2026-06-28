export type OperatorTemplateStatus = 'draft' | 'tested' | 'verified' | 'deprecated';
export type OperatorTemplateTechnologyType = 'chan_sip' | 'pjsip';

export type OperatorTemplateTechnology = OperatorTemplateTechnologyType | {
  type: OperatorTemplateTechnologyType;
  driver: 'chan_sip' | 'asterisk-pjsip';
  deprecated: boolean;
};

export type OperatorTemplate = {
  id: string;
  name: string;
  operator: string;
  region: string;
  country: string;
  technology: OperatorTemplateTechnology;
  status: OperatorTemplateStatus;
  testedWith: {
    freepbx: string[];
    asterisk: string[];
    notes?: string;
  };
  fields: Record<string, string | number | boolean | string[]>;
  requiredUserFields: string[];
  numberFormats: Record<string, string | string[]>;
  diagnostics: {
    hints: string[];
    commonErrors: string[];
  };
  notes: string[];
  security: {
    containsSecrets: false;
    secretPolicy: string;
  };
  migration?: {
    canMigrateToPjsip?: boolean;
    migrationTargetTemplate?: string;
    mappingProfile?: string;
    isMigrationTarget?: boolean;
    notes?: string[];
  };
  notesPath: string;
  jsonPath: string;
};

export type OperatorTemplateFiltersState = {
  search: string;
  status: 'all' | OperatorTemplateStatus;
  technology: 'all' | OperatorTemplateTechnologyType;
  region: string;
  country: string;
};

export type ChansipMigrationPreview = {
  parsedFields: Record<string, string>;
  pjsipPreview: Record<string, string | number | string[]>;
  warnings: string[];
  manualReviewFields: string[];
  maskedSecretsDetected: boolean;
};

export function getTechnologyType(technology: OperatorTemplateTechnology): OperatorTemplateTechnologyType {
  return typeof technology === 'string' ? technology : technology.type;
}

export function isTechnologyDeprecated(technology: OperatorTemplateTechnology): boolean {
  return typeof technology === 'string' ? technology === 'chan_sip' : technology.deprecated;
}
