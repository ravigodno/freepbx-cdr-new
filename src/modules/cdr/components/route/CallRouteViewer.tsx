import React from 'react';
import RouteStepCard from './RouteStepCard';
import RouteResultCard from './RouteResultCard';

interface Props {
  routeSteps: RouteStep[];
  anyAnswered: boolean;
  resultText: string;
  title?: string;
}

export default function CallRouteViewer({
  routeSteps,
  anyAnswered,
  resultText,
  title = 'Маршрут звонка',
}: Props) {
  return (
    <div className="bg-white border border-blue-200 rounded-2xl p-4 shadow-xs">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-blue-500 mb-3">
        {title}
      </div>

      <div className="space-y-2">
        {routeSteps.map((step: any, idx: number) => (
          <RouteStepCard
            key={idx}
            step={step}
            index={idx}
          />
        ))}

        <RouteResultCard
          index={routeSteps.length + 1}
          anyAnswered={anyAnswered}
          resultText={resultText}
        />
      </div>
    </div>
  );
}
