# Разработка

## Структура репозитория

```text
src/
├── index.ts            # публичная точка входа пакета (реэкспорт ниже)
├── cli/
│   ├── index.ts        # вход CLI: разбор аргументов, диспетчеризация, bin
│   ├── prompt.ts       # минимальное синхронное подтверждение y/N
│   └── commands/       # один модуль на подкоманду + реестр (index.ts)
├── core/
│   ├── scanner/        # сканирование исходников: ast.ts, scanner.ts
│   └── env/            # парсер .env, санитайзер секретов, генератор example
├── analysis/           # программный API анализа (каркас, см. limitations.md)
├── config/             # обнаружение, загрузка и слияние envgraph.config
├── output/             # форматирование вывода (json, table, mermaid)
└── filesystem/         # поиск файлов и чтение .env
tests/                  # наборы node:test (cli, create, create-config, scan, …)
dist/                   # сборка (публикуется в npm)
```

## Настройка

Требования:

- Node.js **>= 23.6.0** (код использует нативное отбрасывание типов
  TypeScript — транспилятор не нужен для запуска `src/*.ts` напрямую).
- npm.

```bash
git clone https://github.com/obzori/envgraph.git
cd envgraph
npm install
npm test        # typecheck + набор node:test
npm run build   # компиляция TypeScript в dist/
```

## Как добавить команду

Создайте модуль в `src/cli/commands/` и зарегистрируйте его в массиве
`commands` в `src/cli/commands/index.ts`:

```ts
import type { EnvGraphCommand } from "./types.ts";

export const myCommand: EnvGraphCommand = {
  name: "mycommand",
  description: "Однострочное описание.",
  usage: "envgraph mycommand",
  run(args) {
    // args — всё, что идёт после имени команды
    return 0;
  },
};
```

Рекомендуется выносить логику в чистую функцию, возвращающую строки/результаты,
а `run()` оставлять только печать — так код легко тестировать.

Вклады приветствуются; для больших изменений сначала откройте issue:
https://github.com/obzori/envgraph/issues
