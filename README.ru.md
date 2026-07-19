# VediSMM SDK для TypeScript и JavaScript

Официальный TypeScript/JavaScript-клиент без runtime-зависимостей для
[пользовательского API VediSMM v1](https://vedismm.ru/docs/api). Клиент покрывает
все 83 публичные пользовательские операции. Административных методов намеренно
нет.

> Ветка `0.1.x` предназначена для проверки интерфейса до 1.0. Исходный код и
> неизменяемый Git-тег уже публичны; публикация в npm будет включена после первой
> внешней интеграции.

[English](README.md) · [Полное руководство](docs/ru/guide.md) ·
[OpenAPI-контракт](https://github.com/VediSMM/api-contract)

## Установка

До публикации в npm устанавливайте неизменяемый Git-тег:

```bash
npm install github:VediSMM/sdk-typescript#v0.1.0
```

Поддерживается Node.js 20+ и современные браузеры со стандартным `fetch`.

## Быстрый старт

```ts
import { VediSMM, type ApiEnvelope } from "@vedismm/sdk";

interface Profile { id: number; email: string }

const sdk = new VediSMM({ accessToken: process.env.VEDISMM_TOKEN });
const response = await sdk.profile.getMe<ApiEnvelope<Profile>>();
console.log(response.data.data.id, response.requestId);
```

API разделён на предметные сервисы: `auth`, `profile`, `accounts`, `groups`,
`media`, `posts`, `jobs`, `analytics`, `webhooks` и остальные области. Каждый
OpenAPI `operationId` доступен как именованный camelCase-метод. Для нестандартных
сценариев остаётся низкоуровневый `sdk.call(operationId, options)`.

Безопасные настройки включены по умолчанию: запрет credential-redirect,
ограниченные повторы только для идемпотентных запросов, отдельные типы ошибок,
рекурсивное скрытие секретов, streaming download и проверка webhook по исходным
байтам.

Подробности и примеры: [docs/ru/guide.md](docs/ru/guide.md). Проверка проекта:

```bash
npm ci
npm run verify
```

Контракт `1.0.0`, 83 операции, SHA-256
`0318da9e05a622860cb2cf154c6bca50e931349b3e7a8df54d76173ad961c521`.

Лицензия MIT. Сообщение об уязвимости: [SECURITY.md](SECURITY.md).
