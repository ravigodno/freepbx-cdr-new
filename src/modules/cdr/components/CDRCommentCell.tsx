import React from 'react';

interface CDRCommentCellProps {
  comment?: string;
}

export function CDRCommentCell({
  comment,
}: CDRCommentCellProps) {
  return (
    <td className="py-4 px-4 max-w-xs">
      {comment ? (
        <div className="flex flex-col gap-1">
          <p className="text-slate-700 dark:text-slate-350 bg-slate-50 dark:bg-slate-900/30 rounded-lg p-2.5 border border-slate-200/60 dark:border-slate-800/40 text-[11.5px] font-normal select-all shadow-3xs">
            "{comment}"
          </p>
        </div>
      ) : (
        <span className="text-slate-400 italic text-xs select-none font-light">Нет комментариев</span>
      )}
    </td>
  );
}

export default CDRCommentCell;
