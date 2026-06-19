import type { RouteStep } from '../types/callRoute';

export function buildTimeConditionStep(step: any): RouteStep | null {
  const destination = String(step?.destination || '').trim();

  if (!destination.toLowerCase().startsWith('timeconditions,')) {
    return null;
  }

  const parts = destination.split(',');
  const id = parts[1] || '';

  return {
    label: 'TIME CONDITION',
    title: id ? `Условие времени ${id}` : 'Условие времени',
    number: id,
    pattern: 'Проверка рабочего / нерабочего времени',
    destination,
    members: [],
  };
}
