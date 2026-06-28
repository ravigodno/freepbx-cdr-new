export const ui = {
  buttons: {
    preview: 'Preview',
    apply: 'Apply',
    reset: 'Reset',
    createExtension: 'Создать Extension',
    createTrunk: 'Создать Trunk',
    createRoute: 'Создать маршрут',
    createDepartment: 'Создать отдел'
  },
  status: {
    ready: 'Готово',
    foundation: 'Основа',
    comingSoon: 'Скоро',
    notImplemented: 'Не реализовано',
    planned: 'Запланировано',
    connected: 'Подключено',
    disconnected: 'Нет подключения'
  },
  management: {
    title: 'Управление',
    subtitle: 'Центр администрирования FreePBX',
    overview: 'Обзор',
    extensions: 'Extensions',
    departments: 'Отделы',
    operatorTemplates: 'Шаблоны операторов',
    trunks: 'Trunks',
    outboundRoutes: 'Outbound Routes',
    inboundRoutes: 'Inbound Routes',
    dialPatterns: 'Dial Patterns',
    numberRanges: 'Number Ranges',
    templates: 'Шаблоны',
    overviewTitle: 'Обзор Provisioning Center',
    overviewDescription: 'Единая рабочая область администрирования объектов FreePBX. Extensions готовы; будущие модули будут использовать общий Operation Framework.',
    foundationBadge: 'v5.1.0 Основа',
    freepbxObjects: 'Объекты FreePBX',
    quickActions: 'Быстрые действия',
    quickActionsDescription: 'Точки входа для текущих и будущих сценариев provisioning. Нереализованные модули открывают подготовленные рабочие области.',
    operationFramework: 'Operation Framework',
    designSystem: 'Design System',
    sharedUi: 'Общий UI',
    nextModule: 'Следующий модуль',
    modulePlaceholder: 'Заглушка модуля',
    modulePlaceholderDescription: 'Раздел зарезервирован для реализации через общий Operation Framework. Backend API пока не подключён.',
    moduleRoadmapPrefix: 'Раздел будет использовать общий workflow Preview → Apply → Result, общие summary cards и общую preview table. Место в Roadmap:',
    previewDescription: 'Общая PreviewTable подключена здесь, чтобы макет был готов к реализации.',
    backendNotImplemented: 'Backend операции пока не реализован.',
    navAriaLabel: 'Разделы Управления',
    sections: {
      overviewDescription: 'Сводка центра администрирования FreePBX.',
      extensionsDescription: 'Массовое создание, изменение, удаление и импорт Extensions.',
      departmentsDescription: 'Модель отделов, диапазоны номеров и владельцы.',
      operatorTemplatesDescription: 'Переиспользуемые профили операторов для Trunks и маршрутов.',
      trunksDescription: 'Безопасное provisioning управление Trunks через Preview и Apply.',
      outboundRoutesDescription: 'Шаблоны Outbound Routes и preview Dial Pattern.',
      inboundRoutesDescription: 'DID и сопоставление входящих назначений.',
      dialPatternsDescription: 'Переиспользуемая проверка Dial Pattern и поиск конфликтов.',
      numberRangesDescription: 'Справочник Number Range для решений по маршрутизации.',
      roadmapFoundation: 'v5.1.0 основа',
      roadmapExtensionsComplete: 'Функциональный CRUD завершён',
      roadmapDepartments: 'v5.1.x Отделы',
      roadmapOperatorTemplates: 'v5.1.x Шаблоны операторов',
      roadmapTrunks: 'v5.1.0 Trunks',
      roadmapRoutes: 'v5.1.x Routes',
      roadmapInboundRoutes: 'v5.1.x Inbound Routes',
      roadmapDialPatterns: 'v5.1.x Dial Patterns',
      roadmapNumberRanges: 'v5.1.x Number Ranges'
    },
    metrics: {
      extensions: 'Extensions',
      trunks: 'Trunks',
      outboundRoutes: 'Outbound Routes',
      inboundRoutes: 'Inbound Routes',
      departments: 'Отделы',
      templates: 'Шаблоны'
    }
  },
  operations: {
    create: 'Create',
    update: 'Update',
    delete: 'Delete',
    skip: 'Skip',
    conflict: 'Conflict',
    error: 'Error',
    preview: 'Preview'
  }
} as const;

export type UiText = typeof ui;
