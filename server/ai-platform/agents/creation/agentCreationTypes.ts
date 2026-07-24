export type AgentCreationState =
  | 'draft' | 'validating' | 'preview_ready' | 'applying' | 'publishing'
  | 'creating_extension' | 'reloading' | 'verifying' | 'active' | 'creation_failed';

export const AGENT_CREATION_STATES:AgentCreationState[]=[
  'draft','validating','preview_ready','applying','publishing','creating_extension',
  'reloading','verifying','active','creation_failed',
];

export const AGENT_CREATION_TEMPLATES=[
  {key:'virtual_receptionist',name:'Виртуальный секретарь',role:'Виртуальный секретарь',style:'Спокойный и доброжелательный',greeting:'Здравствуйте. Чем могу помочь?'},
  {key:'first_line',name:'Оператор первой линии',role:'Оператор первой линии',style:'Деловой и внимательный',greeting:'Здравствуйте. Я вас слушаю.'},
  {key:'information_assistant',name:'Информационный помощник',role:'Информационный помощник',style:'Спокойный и информативный',greeting:'Здравствуйте. Чем могу помочь?'},
  {key:'blank',name:'Пустой AI-сотрудник',role:'AI-сотрудник',style:'Нейтральный',greeting:'Здравствуйте. Чем могу помочь?'},
] as const;
