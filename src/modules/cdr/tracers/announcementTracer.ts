import type { RouteStep } from '../types/callRoute';

export function buildAnnouncementStep(step: any): RouteStep | null {
  const destination = String(step?.destination || '').trim();

  if (!destination.toLowerCase().startsWith('app-announcement,')) {
    return null;
  }

  const parts = destination.split(',');
  const id = parts[1] || '';

  return {
    label: 'ANNOUNCEMENT',
    title: id ? `Анонс ${id}` : 'Анонс',
    number: id,
    pattern: 'Воспроизведение сообщения',
    destination,
    members: [],
  };
}
