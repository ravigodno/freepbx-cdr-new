import React, { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  text: string;
  className?: string;
  tabIndex?: number;
};

type TooltipPosition = {
  left: number;
  top: number;
  placement: 'above' | 'below';
};

export function DirectoryTextTooltip({ text, className = '', tabIndex = 0 }: Props) {
  const id = useId();
  const textRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const showTooltip = () => {
    const element = textRef.current;
    if (!element || element.scrollWidth <= element.clientWidth) return;

    const bounds = element.getBoundingClientRect();
    const tooltipWidth = Math.min(420, Math.max(180, bounds.width + 48));
    const left = Math.min(
      window.innerWidth - tooltipWidth - 12,
      Math.max(12, bounds.left)
    );
    const placement = bounds.top >= 56 ? 'above' : 'below';

    setPosition({
      left,
      top: placement === 'above' ? bounds.top - 8 : bounds.bottom + 8,
      placement
    });
  };

  const hideTooltip = () => setPosition(null);

  return (
    <>
      <span
        ref={textRef}
        tabIndex={tabIndex}
        aria-describedby={position ? id : undefined}
        className={`block min-w-0 truncate whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 ${className}`}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {text}
      </span>
      {position && createPortal(
        <span
          id={id}
          role="tooltip"
          className={`pointer-events-none fixed z-[10000] max-w-[420px] rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium leading-relaxed text-white shadow-xl ${
            position.placement === 'above' ? '-translate-y-full' : ''
          }`}
          style={{ left: position.left, top: position.top }}
        >
          {text}
        </span>,
        document.body
      )}
    </>
  );
}
