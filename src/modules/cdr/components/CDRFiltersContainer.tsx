import React from 'react';
import { CDRFilters } from './CDRFilters';

export function CDRFiltersContainer(props: any) {
  return (
    <div className="space-y-3">

      {/* Основные фильтры */}
      <CDRFilters {...props} />

    </div>
  );
}
