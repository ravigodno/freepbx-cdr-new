# Changelog

## 5.6.9 - 2026-07-10

### Fixed

- Обработанные пропущенные звонки теперь получают дополнительный бейдж «Обработано» для статусов `processed`, `called_back` и `repeated_inbound`.
- Удалена отдельная карточка «Ожидают обработки»; верхний показатель «Потерянные» согласован с формулой «Пропущенные минус Обработанные».
- Фильтр «Потерянные» показывает все необработанные пропущенные звонки, включая находящиеся внутри короткого KPI-окна.

## 5.6.7 - 2026-07-10

### Fixed

- Расчёт CPU для графика «Нагрузка железа + звонки» переведён с locale-зависимого вывода `top` на дельту Linux `/proc/stat`.
- Устранены ложные значения CPU около 100% на Debian с десятичной запятой в системной locale.
- Один и тот же механизм расчёта теперь используется на Debian, CentOS и Sangoma Linux.

## 5.6.6 - 2026-07-10

### Improved

- График «Динамика звонков» в разделе «Отчёты → Обзор» поддерживает одновременный выбор входящих, исходящих, внутренних, пропущенных, обработанных, потерянных звонков и SLA.
- SLA отображается на отдельной процентной шкале, а tooltip показывает только включённые серии.

### Fixed

- Почасовая детализация строит полный диапазон дат с нулевыми buckets для часов без звонков.
- Backend и frontend используют единый machine key `YYYY-MM-DD HH:00`, поэтому реальные значения больше не теряются при объединении с пустой временной шкалой.

## 5.6.5 - 2026-07-10

### Fixed

- Восстановлен бейдж «Переведён на» для реальных BlindTransfer-событий из Asterisk CEL.
- Target перевода определяется из explicit CEL fields или последующих событий того же `linkedid` с приоритетной проверкой общего `bridge_id`.
- В хронологию звонка добавлен отдельный шаг BlindTransfer с номером назначения.
- Обычные Queue, Ring Group, Inbound Route, IVR, Follow Me и Time Condition по-прежнему не считаются переводом.

## 5.6.4 - 2026-07-10

### Fixed

- Бейдж «Переведён на» теперь появляется только при наличии явного BlindTransfer evidence.
- Обычная маршрутизация через Queue, Ring Group, Inbound Route, IVR, Follow Me и Time Condition больше не определяется как перевод.
- AttendedTransfer не смешивается с бейджем BlindTransfer.

## 5.6.3 - 2026-07-10

### Fixed

- Хронология звонка в реестре теперь доступна всем авторизованным пользователям по клику на UID в столбце «Время вызова / ID», включая суперпользователя (`su`).
- Ограничения видимости звонков для ролей сохранены без изменений.

## 5.5.4 - 2026-07-03

### Added

- Добавлены новые разделы в матрицу прав доступа в панели управления (Permissions Matrix):
  - **Скрипты разговоров** (управление сценариями разговоров операторов).
  - **Умный автоответчик** (настройка AI-автоответчика и LLM интеграций).
  - **AI администратор** (AI-ассистент администратора АТС для диагностики и логов).
- Настроена глобальная видимость модулей: суперпользователь (`su`) может полностью отключать данные модули для всех пользователей. По умолчанию во время разработки эти разделы скрыты от всех пользователей (`false`).
- Расширены настройки AI-провайдеров во вкладке `AIPBXAdmin`: добавлена поддержка Google Gemini, OpenAI, Anthropic и DeepSeek с динамическим выбором моделей и температуры.

### Fixed

- Исправлена ошибка синтаксиса (Unterminated string literal) в файле обработчика диагностики `server/aiPbxAdmin.ts`.
- Успешно протестирована сборка и линтинг всего приложения перед релизом.


## 2.1.1 - 2026-06-11

### Changed

- Default start date (`startDate`) is now initialized to the 1st of the current month instead of 7 days ago (`getDefaultStartDate`).
- Filter reset button ("Сбросить фильтры") now applies the current month preset (`applyThisMonthPreset`) instead of the 7-day preset, completely resetting the dashboard and lists to the beginning of the month.
- Optimized and improved the responsive interface rendering and Russian localization rules.

## 2.0.0 - 2026-06-08

### Added

- 24-hour `from` / `to` time filtering for call lists and dashboard statistics.
- Russian date picker with Monday-first calendar layout.
- HMAC-signed authentication tokens to prevent client-side role tampering.

### Changed

- Bumped application version from `1.0.0` to `2.0.0`.
- Date filtering now uses local date values instead of UTC-derived ISO date strings in the UI.
- Restored normal multi-line source formatting after resolving the GitHub merge conflict.


### Security

- Removed shell-based recording lookup and replaced it with safe in-process path resolution constrained to the recordings root.
