import type { RouteStep } from '../types/callRoute';
import { announcementId, greetingTitle } from '../../../../shared/automatedCallDestination';

export function buildAnnouncementStep(step: any): RouteStep | null {
  const destination = String(step?.destination || '').trim();

  const id = announcementId(destination);
  if (!id) {
    return null;
  }

  return {
    label: 'Приветствие',
    title: step.type === 'announcement' ? step.title || greetingTitle(id) : greetingTitle(id),
    number: id,
    pattern: 'Воспроизведение сообщения',
    destination,
    members: [],
  };
}
