export const ui = {
  buttons: {
    preview: 'Preview',
    apply: 'Apply',
    reset: 'Reset',
    clear: 'Очистить',
    showPreview: 'Показать Preview',
    view: 'Просмотр',
    json: 'JSON',
    notes: 'Notes',
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
    trunkLabNav: 'Trunk Lab',
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
      trunkLabDescription: 'Read-only диагностика SIP/PJSIP Trunks через Asterisk CLI/AMI.',
      trunksDescription: 'Безопасное provisioning управление Trunks через Preview и Apply.',
      outboundRoutesDescription: 'Шаблоны Outbound Routes и preview Dial Pattern.',
      inboundRoutesDescription: 'DID и сопоставление входящих назначений.',
      dialPatternsDescription: 'Переиспользуемая проверка Dial Pattern и поиск конфликтов.',
      numberRangesDescription: 'Справочник Number Range для решений по маршрутизации.',
      roadmapFoundation: 'v5.1.0 основа',
      roadmapExtensionsComplete: 'Функциональный CRUD завершён',
      roadmapDepartments: 'v5.1.x Отделы',
      roadmapOperatorTemplates: 'v5.1.x Шаблоны операторов',
      roadmapTrunkLab: 'v5.2.0 Trunk Lab Read-only Diagnostics',
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
    },
    operatorTemplatesModule: {
      title: 'Шаблоны операторов',
      description: 'Библиотека Git-шаблонов операторов связи для FreePBX/Asterisk. Шаблоны помогают быстрее подбирать настройки SIP/PJSIP, сохранять проверенные варианты и готовить миграцию chan_sip → PJSIP.',
      gitWarning: 'Git-шаблон не содержит пароли, токены и клиентские данные. Боевые значения вводятся только локально на конкретной АТС.',
      chansipWarning: 'chan_sip является устаревшим драйвером. Для новых Trunks рекомендуется использовать PJSIP.',
      stats: {
        total: 'Всего шаблонов',
        verified: 'Verified',
        tested: 'Tested',
        draft: 'Draft',
        pjsip: 'PJSIP',
        chansip: 'chan_sip',
        deprecated: 'Deprecated'
      },
      filters: {
        search: 'Поиск по оператору',
        status: 'Статус',
        technology: 'Технология',
        region: 'Регион',
        country: 'Страна',
        all: 'Все',
        allRegions: 'Все регионы',
        allCountries: 'Все страны'
      },
      table: {
        operator: 'Оператор',
        template: 'Шаблон',
        region: 'Регион',
        technology: 'Технология',
        status: 'Статус',
        freepbx: 'FreePBX',
        asterisk: 'Asterisk',
        actions: 'Действия',
        notTested: 'Не указано'
      },
      details: {
        title: 'Карточка шаблона',
        empty: 'Выберите шаблон в таблице.',
        main: 'Основные сведения',
        technology: 'Технология',
        status: 'Статус',
        testedWith: 'Tested With',
        settings: 'Настройки SIP/PJSIP',
        requiredUserFields: 'Required User Fields',
        numberFormats: 'Number Formats',
        diagnostics: 'Diagnostics',
        notes: 'Notes',
        security: 'Security',
        migration: 'Migration',
        jsonPath: 'JSON path',
        notesPath: 'Notes path'
      },
      migration: {
        title: 'Миграция chan_sip → PJSIP',
        description: 'Вставьте chan_sip настройки текстом. PBXPuls покажет распознанные поля, предполагаемые PJSIP значения и предупреждения без сохранения данных.',
        inputLabel: 'chan_sip config',
        inputPlaceholder: 'host=sip.example.ru\nusername=123456\nsecret=my-password\nfromuser=123456\nfromdomain=sip.example.ru\ntype=peer\ncontext=from-trunk\nqualify=yes\nnat=force_rport,comedia\ncanreinvite=no\ndtmfmode=rfc2833\ndisallow=all\nallow=alaw&ulaw\ninsecure=port,invite',
        parsedFields: 'Распознанные chan_sip поля',
        pjsipPreview: 'Предполагаемые PJSIP поля',
        warnings: 'Предупреждения',
        manualReview: 'Требуют ручной проверки',
        noData: 'Нет данных для отображения',
        secretsDetected: 'Обнаружены секретные поля. Значения замаскированы и не сохраняются.'
      },
      statusLabels: {
        draft: 'Draft',
        tested: 'Tested',
        verified: 'Verified',
        deprecated: 'Deprecated'
      }
    },
    trunkLab: {
      title: 'Trunk Lab',
      description: 'Read-only диагностика SIP/PJSIP Trunks. PBXPuls анализирует состояние регистраций, endpoints, contacts и peers без изменения FreePBX.',
      readOnlyWarning: 'Этот экран только читает состояние Asterisk/FreePBX. Он не создаёт, не изменяет и не удаляет Trunks.',
      refresh: 'Обновить диагностику',
      generatedAt: 'Сформировано',
      sourceStatus: {
        title: 'Статус источников',
        warning: 'Часть источников недоступна. Диагностика показана по доступным данным.'
      },
      summary: {
        total: 'Всего Trunks',
        registered: 'Registered',
        problems: 'Problems',
        pjsip: 'PJSIP',
        chansip: 'chan_sip',
        unreachable: 'Unreachable',
        unknown: 'Unknown'
      },
      filters: {
        search: 'Поиск по имени',
        technology: 'Технология',
        risk: 'Статус',
        registration: 'Registration',
        all: 'Все'
      },
      table: {
        trunk: 'Trunk',
        technology: 'Технология',
        registration: 'Регистрация',
        endpoint: 'Endpoint/Peer',
        contact: 'Contact',
        risk: 'Риск',
        summary: 'Кратко',
        lastTest: 'Последний тест',
        actions: 'Действия'
      },
      details: {
        empty: 'Выберите Trunk в таблице.',
        summary: 'Общая сводка',
        registration: 'Registration',
        endpoint: 'Endpoint/Peer',
        contacts: 'Contacts',
        auth: 'Auth',
        problems: 'Problems',
        recommendations: 'Recommendations',
        notes: 'Notes',
        raw: 'Raw command snippets',
        masked: 'masked secrets',
        templateSuggestion: 'Возможный шаблон'
      },
      testing: {
        title: 'Тестирование Trunk',
        registration: 'Проверить регистрацию',
        peer: 'Проверить Peer/Contact',
        outbound: 'Проверить исходящий звонок',
        running: 'Тест выполняется...',
        failed: 'Тест не выполнен.',
        callWarning: 'Тестовый звонок может быть тарифицирован оператором. PBXPuls не изменяет настройки FreePBX, но инициирует реальный вызов. Тест использует текущие Outbound Routes FreePBX.',
        sourceExtension: 'Extension-источник',
        testNumber: 'Тестовый номер',
        timeout: 'Timeout seconds',
        confirm: 'Я понимаю, что будет инициирован реальный тестовый звонок.',
        startCall: 'Запустить тестовый звонок',
        results: 'Результаты тестов',
        noResults: 'Тесты ещё не запускались.'
      },
      empty: {
        noTrunks: 'Trunks не найдены или команды недоступны.',
        noProblems: 'Проблем не обнаружено.',
        noRecommendations: 'Рекомендаций нет.',
        cliUnavailable: 'AMI/CLI недоступен или Asterisk не отвечает.'
      },
      status: {
        risk: { ok: 'ok', warning: 'warning', critical: 'critical', unknown: 'unknown' },
        registration: { registered: 'registered', rejected: 'rejected', auth_failed: 'auth_failed', timeout: 'timeout', no_registration: 'no_registration', unavailable: 'unavailable', unknown: 'unknown' }
      }
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
