# Справочник CLI

Все команды работают в текущей рабочей директории. Код выхода `0` — успех,
любой другой — ошибка.

## Общее поведение

- `envgraph` (без аргументов) выполняет команду по умолчанию и печатает
  `envgraph is ready.` — выход `0`.
- `envgraph -h` / `envgraph --help` печатает общую справку — выход `0`.
- `envgraph -v` / `envgraph --version` печатает установленную версию из
  `package.json` пакета — выход `0`.
- Неизвестная команда печатает
  `envgraph: unknown command "<name>".` и общую справку — выход `1`.

## Файл конфигурации

При каждом запуске envgraph ищет файл конфигурации в текущей директории и
загружает его автоматически:

`envgraph.config.ts`, `envgraph.config.mts`, `envgraph.config.js`,
`envgraph.config.mjs`, `envgraph.config.cjs` или `envgraph.config.json`
(побеждает первый найденный). Создать его можно командой
`envgraph create config`.

Распознаваемые ключи (все необязательные, накладываются на значения по
умолчанию):

```js
export default {
  example: {
    keepComments: true,              // сохранять комментарии .env в .env.example
    defaults: {                      // полная замена значения по ключу
      DISCORD_TOKEN: "enter_here_your_discord_token",
    },
  },
};
```

`defaults` важнее санитайзера чувствительных имён: если ключ указан там, в
`.env.example` попадает значение из конфига как есть.

Если конфиг не удаётся загрузить, в stderr печатается предупреждение, а работа
продолжается с конфигурацией по умолчанию. Поиск поднимается вверх от текущей
директории и останавливается на корне проекта (`.git`, `package.json`, …),
поэтому запуск из подпапки тоже находит конфиг; при этом envgraph печатает
подсказку, если загруженный конфиг лежит выше рабочей директории.

## `envgraph scan`

```bash
envgraph scan [--force] [--format json|table|mermaid] [-o <file>]
envgraph scan --help   # или -h: печать использования, выход 0
```

Ищет в файлах исходников использование переменных окружения
(`process.env.*`), механизмы их загрузки (dotenv, `process.loadEnvFile`) и
файлы `.env*`. Подробности в [Сканирование](scanning.md).

Опции:

| Опция | Короткая | Действие |
| --- | --- | --- |
| `--force` | `-f` | Сканировать, даже если каталог слишком большой. |
| `--help` | `-h` | Печать использования — выход `0`. |
| `--format <fmt>` | `-F` | Формат вывода: `json`, `table` или `mermaid`. Также `--format=<fmt>`. |
| `--output <file>` | `-o` | Записать результат в файл вместо stdout. Также `--output=<file>`. |

### Форматы вывода

- **по умолчанию** (без `--format`): человекочитаемый отчёт с цветом;
- **`json`**: машиночитаемый объект с полями `variables`, `loaders`,
  `envFiles` и `errors`;
- **`table`**: текстовая таблица без ANSI-цветов;
- **`mermaid`**: граф `flowchart LR`, где файлы `.env*` питают лоадеры, а

### Защита от больших каталогов

Перед чтением чего-либо envgraph считает записи каталога (файлы + папки,
кроме `node_modules`, `.git`, `dist`, `build`). Подсчёт рано останавливается
после 50 000 записей (`DIRECTORY_ENTRY_LIMIT` в `src/cli/commands/scan.ts`).

- Выше лимита **без** `--force`: ничего не сканируется, в stderr печатается
  сообщение, код выхода `1`.
- Выше лимита **с** `--force` (`-f`): сначала предупреждение, затем скан.
  Дополнительно, если найдено больше 10 000 исходных файлов, печатается
  второе предупреждение.

Вывод:

- Если ничего не найдено: `No environment variables found.` — выход `0`.
- Иначе сводка, строки переменных по имени, блоки «Environment loaders» и
  «.env files» (только когда непустые):

```text
1 usages · 1 variables
1 env loaders

PORT  src/config.ts:1

Environment loaders

dotenv  src/index.ts:1

.env files

.env
.env.local
```

Каждая строка: имя переменной, первое место (`файл:строка`), суффикс `×N`
при нескольких использованиях. Ошибки разбора идут в stderr как
`envgraph scan: could not parse <file>: <message>`, но код выхода не меняют.

Подсказка: при запуске `scan` из подпапки проекта в stderr печатается серая
строка `envgraph: run from the project root to include the whole graph`.

## `envgraph create example`

```bash
envgraph create example [--force] [--dry-run]
# короткие формы: -f (force), -d (dry-run)
```

Генерирует `.env.example` из `.env`. См.
[Генерация .env.example](env-example.md).

Поведение:

- Нет или неверное имя генератора: `Available: example, config` — выход `1`.
- Нет `.env`: `envgraph: .env not found in <cwd>.` — выход `1`.
- `.env.example` существует:
  - интерактивный терминал: запрос перезаписи, только `y`/`Y` перезаписывает;
    отказ печатает `envgraph: .env.example not modified.` — выход `0`;
  - неинтерактивный режим (нет TTY): отказ — выход `1`;
  - с `--force` перезапись без вопросов.
- Успех: `✓ Created .env.example` плюс предупреждение о проверке — выход `0`.

## `envgraph create config`

```bash
envgraph create config [--force] [--dry-run] [--ts|--js]
```

Создаёт каркас конфигурации: `envgraph.config.ts` для TypeScript-проектов
или `envgraph.config.js` для остальных. Тип проекта определяется по наличию
`tsconfig.json` или файлов `.ts`/`.mts` в корне; флаги `--ts` / `--js`
переопределяют определение. Поведение перезаписи зеркалит
`create example`.

## `envgraph help` и `envgraph version`

- `envgraph help` — общая справка, эквивалент `--help`, выход `0`.
- `envgraph version` — `envgraph v<версия>` из `package.json`, эквивалент
  `--version`, выход `0`.

  переменные связаны с местами использования.

Примеры:

```bash
envgraph scan --format json > report.json
envgraph scan --format mermaid -o docs/env-graph.mmd
```
