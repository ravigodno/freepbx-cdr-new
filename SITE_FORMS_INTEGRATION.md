# PBXPuls: получение заявок с сайта

PBXPuls принимает формы через отдельный webhook каждой интеграции:

```text
POST https://pbxpuls.example.ru/api/integrations/site-forms/{integrationId}/webhook
Authorization: Bearer {one-time-token}
Content-Type: application/json
```

PBXPuls обычно находится в локальной сети за NAT. Публичный адрес должен
завершать TLS на Apache/Nginx и проксировать запрос на PBXPuls. Reverse proxy
обязан передавать `X-Forwarded-For` и `X-Forwarded-Proto https`. Эти заголовки
учитываются только от loopback или приватного адреса непосредственного proxy.
Порт PBXPuls нельзя публиковать напрямую в интернет.

## Универсальный JSON

```json
{
  "eventId": "site-1-form-12-result-4581",
  "formId": "12",
  "resultId": "4581",
  "createdAt": "2026-08-03T16:40:00+03:00",
  "siteId": "s1",
  "siteUrl": "https://example.ru",
  "pageUrl": "https://example.ru/services/",
  "pageTitle": "Услуги",
  "fields": {
    "name": "Иван Петров",
    "phone": "+7 978 123-45-67",
    "email": "example@example.ru",
    "company": "Компания",
    "comment": "Прошу перезвонить"
  },
  "utm": {
    "source": "yandex",
    "medium": "cpc",
    "campaign": "brand"
  }
}
```

Обязательны стабильный `eventId`, `formId` и корректный внешний телефон.
Повторный `eventId` не создаёт вторую заявку.

## 1С-Битрикс и Битрикс24

Для интеграций этих типов PBXPuls также принимает поля верхнего регистра в
`data.FIELDS` или `FIELDS`: `NAME`, `PHONE`, `EMAIL`, `COMPANY`, `COMMENT`,
`FORM_ID`, `RESULT_ID` и `UTM_*`. Идентификаторы могут передаваться как
`data.FORM_ID` и `data.RESULT_ID`. Если отдельного `eventId` нет, он безопасно
формируется из типа источника, формы и результата. Без `RESULT_ID` отправитель
должен передать собственный стабильный `eventId`.

## Настройка

1. Создать интеграцию в `Настройки → Интеграции`.
2. Скопировать URL и одноразово показанный токен.
3. Указать разрешённые ID форм. IP-фильтр оставлять пустым, пока не известен
   фактический внешний адрес отправителя, который видит reverse proxy.
4. Отправить тестовую заявку с сайта.
5. Проверить журнал webhook и появление заявки в `Маркетинг → Заявки с сайта`.

Токен не хранится в открытом виде. Его потеря требует перевыпуска; старый токен
после этого сразу перестаёт работать.
