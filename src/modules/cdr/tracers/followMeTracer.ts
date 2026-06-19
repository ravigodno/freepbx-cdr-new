import type { RouteStep } from '../types/callRoute';

export function buildFollowMeStep(step: any): RouteStep | null {
  const destination = String(step?.destination || '').trim();

  if (!destination.toLowerCase().startsWith('ext-findmefollow,')) {
    return null;
  }

  const parts = destination.split(',');
  const extension = parts[1] || '';

  return {
    label: 'FOLLOW ME',
    title: extension ? `Follow Me ${extension}` : 'Follow Me',
    number: extension,
    pattern: 'Переадресация Follow Me',
    destination,
    members: [],
  };
}
