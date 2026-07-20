# Руководство TypeScript SDK

## Настройка и authentication

По умолчанию `VediSMM` использует `https://vedismm.ru/api/v1`. Передайте токен
строкой либо async-provider; SDK никогда не сохраняет токен на диск. Provider
вызывается один раз на логический авторизованный запрос и не вызывается для
публичных операций.

Авторизованные запросы передают один credential одновременно в стандартном
`Authorization: Bearer` и резервном заголовке VediSMM `X-API-Token`. Это
сохраняет авторизацию за proxy, удаляющими `Authorization`; API отдаёт приоритет
стандартному заголовку. Оба заголовка управляются SDK и не должны логироваться.

```ts
const sdk = new VediSMM({
  accessToken: () => tokenVault.read(),
  timeoutMs: 30_000,
  maxRetries: 2,
});
```

Пользовательский `baseUrl` должен использовать HTTPS; HTTP разрешён только для
localhost-тестов. Запросы с токеном выполняются с `redirect: "manual"`, поэтому
Bearer credential не уйдёт на другой origin.

## Вызов операций

Каждый из 83 OpenAPI `operationId` находится в своём предметном сервисе:

```ts
await sdk.posts.createPostDraft({
  idempotencyKey: createIdempotencyKey(),
  body: { title: "Запуск", content: "Текст", account_ids: [42] },
});

await sdk.posts.updatePostDraft({
  path: { id: 101 },
  ifMatch: '"3"',
  body: { title: "Новая версия" },
});
```

Path-параметры кодируются, массивы query становятся повторяющимися ключами.
Пользовательские заголовки не могут подменить `Authorization`, `Host`,
`Content-Length`, `Idempotency-Key` или `If-Match`.

## Errors и диагностика

Доступны отдельные классы `RateLimitError`, `PreconditionFailedError`,
`TimeoutError`, `CancelledError`, `DecodeError`, `RedirectError`,
`TransportError` и общий `ApiError`. API-ошибка сохраняет `status`, стабильный
`code`, безопасный `detail`, validation `errors`, `requestId` и ограниченный
`retryAfterMs`. Секреты скрываются в сообщениях, вложенных ошибках и causes.

## Idempotency и повторы

Создавайте `createIdempotencyKey()` один раз на логическую изменяющую операцию.
SDK сохраняет этот ключ между ограниченными попытками. Небезопасный запрос без
ключа не повторяется. Для допустимых повторов учитываются только временные
ошибки, ограниченный `Retry-After` и exponential backoff с jitter.

## ETag и конкуренция

Сохраните `result.etag` и передайте как `ifMatch`. Ответ `412` становится
`PreconditionFailedError`: перечитайте ресурс и только затем принимайте решение
о новом изменении.

## Pagination

`paginate` следует только серверному `meta.next_cursor`, обнаруживает зацикленный
cursor и поддерживает отмену через `AbortSignal`.

## Media

Для upload передайте `FormData` в `uploadMedia`; boundary задаст runtime. Не
устанавливайте multipart `Content-Type` вручную. Binary download возвращает
`ReadableStream<Uint8Array>`, поэтому файл не обязан целиком находиться в памяти.

## Jobs

`waitForJob` опрашивает `getPublicationJob` с конечным timeout и отменой.
`succeeded` и `partially_succeeded` возвращаются вызывающему коду; `failed` и
`cancelled` создают `JobFailedError` с финальным объектом задания.

## Webhooks

В `verifyWebhookSignature` передавайте исходные bytes тела до JSON parsing.
Helper проверяет `v1=` HMAC-SHA256 constant-time сравнением и контролирует окно
timestamp. Для replay-защиты передайте атомарный `ReplayStore.claim(eventId)` из
БД или кэша: `true` разрешён только при первом захвате ID.

## Пользовательский transport

Свой `fetch` можно передать для proxy, observability и тестов. Он получает уже
подготовленные URL и безопасные параметры. Не журналируйте `Authorization` и
webhook secret внутри пользовательского транспорта.
