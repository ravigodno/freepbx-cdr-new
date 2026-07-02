import React, { useEffect, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const RU_MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const RU_WEEKDAYS_MONDAY_FIRST = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export const toLocalDateInputValue = (date: Date) => {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
};

export const parseDateInputValue = (value: string) => {
  if (!value) return new Date();
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
};

const formatRussianDate = (value: string) => {
  if (!value) return 'Выберите дату';
  return parseDateInputValue(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

interface RussianDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  buttonClassName?: string;
  accent?: 'blue' | 'red';
  showClear?: boolean;
}

const defaultButtonClass = 'min-w-[112px] bg-white border border-slate-200 rounded px-2.5 py-1 text-[11px] text-slate-700 font-mono focus:outline-none focus:border-red-500 hover:border-slate-300 transition-all text-left flex items-center gap-1.5 cursor-pointer';
const accentClasses = {
  blue: {
    selected: 'bg-blue-600 text-white shadow-sm',
    today: 'bg-blue-50 text-blue-700 border border-blue-100'
  },
  red: {
    selected: 'bg-red-600 text-white shadow-sm',
    today: 'bg-red-50 text-red-700 border border-red-100'
  }
};

export default function RussianDatePicker({ value, onChange, ariaLabel, className = '', buttonClassName, accent = 'red', showClear = false }: RussianDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedDate = parseDateInputValue(value);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));

  useEffect(() => {
    if (!isOpen) {
      setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [value, isOpen]);

  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1 - mondayOffset);

  const days = Array.from({ length: 42 }, (_, index) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + index);
    return d;
  });

  const todayValue = toLocalDateInputValue(new Date());

  const changeMonth = (offset: number) => {
    setVisibleMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  return (
    <div className={['relative', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        lang="ru-RU"
        aria-label={ariaLabel}
        onClick={() => setIsOpen(prev => !prev)}
        className={buttonClassName || defaultButtonClass}
      >
        <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span>{formatRussianDate(value)}</span>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => changeMonth(-1)} className="p-1 rounded-md hover:bg-slate-100 text-slate-500" aria-label="Предыдущий месяц">
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="text-sm font-bold text-slate-800 select-none">
              {RU_MONTHS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
            </div>

            <button type="button" onClick={() => changeMonth(1)} className="p-1 rounded-md hover:bg-slate-100 text-slate-500" aria-label="Следующий месяц">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400 mb-1 select-none">
            {RU_WEEKDAYS_MONDAY_FIRST.map(day => <div key={day}>{day}</div>)}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map(day => {
              const dayValue = toLocalDateInputValue(day);
              const isSelected = dayValue === value;
              const isToday = dayValue === todayValue;
              const isOutsideMonth = day.getMonth() !== visibleMonth.getMonth();

              return (
                <button
                  key={dayValue}
                  type="button"
                  onClick={() => {
                    onChange(dayValue);
                    setIsOpen(false);
                  }}
                  className={`h-8 rounded-lg text-xs font-medium transition-all ${
                    isSelected
                      ? accentClasses[accent].selected
                      : isToday
                        ? accentClasses[accent].today
                        : isOutsideMonth
                          ? 'text-slate-300 hover:bg-slate-50'
                          : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2">
            {showClear && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Очистить
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onChange(todayValue);
                setVisibleMonth(new Date());
                setIsOpen(false);
              }}
              className="w-full rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Сегодня
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
