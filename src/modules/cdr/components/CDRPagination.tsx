import React from 'react';

type Props = {
  page: number;
  totalPages: number;
  totalCalls: number;
  visibleCount: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
};

export function CDRPagination({
  page,
  totalPages,
  totalCalls,
  visibleCount,
  isLoading,
  onPageChange
}: Props) {
  return (
    <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 text-xs">
      <span className="text-slate-550 text-sm font-light">
        Показано <span className="font-semibold text-slate-800">{visibleCount}</span> строк из <span className="font-semibold text-slate-800">{totalCalls}</span>
      </span>

      <div className="flex items-center gap-2">
        <button disabled={page <= 1 || isLoading} onClick={() => onPageChange(page - 1)} className="px-3 py-1 bg-white border rounded disabled:opacity-40">
          Назад
        </button>

        <span>Страница {page} из {totalPages}</span>

        <button disabled={page >= totalPages || isLoading} onClick={() => onPageChange(page + 1)} className="px-3 py-1 bg-white border rounded disabled:opacity-40">
          Вперёд
        </button>
      </div>
    </div>
  );
}
