import React from 'react';

type Props = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;

  statusFilter: string;
  searchQuery: string;
  numberFilter: string;

  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  setStartTime: (v: string) => void;
  setEndTime: (v: string) => void;

  setStatusFilter: (v: string) => void;
  setSearchQuery: (v: string) => void;
  setNumberFilter: (v: string) => void;
};

export function CDRFilters({
  startDate,
  endDate,
  startTime,
  endTime,
  statusFilter,
  searchQuery,
  numberFilter,
  setStartDate,
  setEndDate,
  setStartTime,
  setEndTime,
  setStatusFilter,
  setSearchQuery,
  setNumberFilter
}: Props) {
  return (
    <div className="space-y-3 bg-white border border-slate-200 rounded-xl p-4">

      {/* SEARCH */}
      <div className="flex gap-2">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск..."
          className="flex-1 border rounded-lg px-3 py-2 text-xs"
        />

        <input
          value={numberFilter}
          onChange={(e) => setNumberFilter(e.target.value)}
          placeholder="Номер"
          className="w-40 border rounded-lg px-3 py-2 text-xs"
        />
      </div>

      {/* DATE */}
      <div className="flex gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="border rounded-lg px-2 py-1 text-xs"
        />

        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="border rounded-lg px-2 py-1 text-xs"
        />

        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="border rounded-lg px-2 py-1 text-xs"
        />

        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="border rounded-lg px-2 py-1 text-xs"
        />
      </div>

      {/* STATUS */}
      <div className="flex gap-2 flex-wrap">
        {['ALL','INBOUND','OUTBOUND','MISSED','INTERNAL'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-2 py-1 text-xs rounded border ${
              statusFilter === s
                ? 'bg-slate-900 text-white'
                : 'bg-white hover:bg-slate-50'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

    </div>
  );
}
