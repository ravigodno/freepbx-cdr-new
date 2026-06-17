import React from 'react';
import { CDRFiltersContainer } from '../components/CDRFiltersContainer';

export default function CDRPage(props: any) {
  return (
    <div className="space-y-4">
      <CDRFiltersContainer {...props} />
    </div>
  );
}
