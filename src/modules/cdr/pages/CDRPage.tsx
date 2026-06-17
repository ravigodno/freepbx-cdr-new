import React from 'react';
import { CDRFiltersContainer } from '../components/CDRFiltersContainer';
import { CDRTable } from '../components/CDRTable';

export default function CDRPage(props: any) {
  return (
    <div className="space-y-4">
      <CDRFiltersContainer {...props} />
      <CDRTable calls={props.calls || []} />
    </div>
  );
}
