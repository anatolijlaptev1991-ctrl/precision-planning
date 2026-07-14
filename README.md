<div align="center">

# 🧭 Скилл генерации плана выполнения задачи

**Версия 4.0 — универсальная спецификация с формальными контрактами, моделью рисков, бюджетом проверок, машинно-читаемыми логами и управляемой деградацией.**

[![License](https://img.shields.io/github/license/anatolijlaptev1991-ctrl/precision-planning?style=flat-square)](LICENSE)
|[![Stars](https://img.shields.io/github/stars/anatolijlaptev1991-ctrl/precision-planning?style=flat-square)](https://github.com/anatolijlaptev1991-ctrl/precision-planning/stargazers)
|[![Version](https://img.shields.io/badge/skill-v4.0.0-6366f1?style=flat-square)](skill/SKILL.md)
|[![Hermes](https://img.shields.io/badge/Hermes%20Agent-compatible-6366f1?style=flat-square)](https://github.com/NousResearch/hermes-agent)
|[![npm](https://img.shields.io/npm/v/@anatolijlaptev1991/precision-planning?style=flat-square&label=npm)](https://www.npmjs.com/package/@anatolijlaptev1991/precision-planning)
|[![Node](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)

</div>

---

## Описание

Скилл преобразует один или несколько `.md` файлов с описанием задачи, процедуры,
требований или архитектурной логики в **формализованный, исполнимый, проверяемый
и аудируемый план выполнения**.

Результат — самодостаточная файловая структура `Plan_<plan_name>/`, содержащая:

- иерархию **фаз, задач и чекпоинтов**;
- машинно-читаемые **YAML/NDJSON-артефакты**;
- зависимости и **частичный порядок** выполнения;
- проверки эффектов и инвариантов;
- **многомерную модель рисков** с risk tags и матрицей действий;
- **профиль среды исполнения** (command policy, path policy, network policy);
- правила отката и стратегии повторов;
- журналы выполнения и **evidence-модель**;
- аудит и финальный отчёт.

> Скилл создаёт план, но не выполняет запланированные действия и не подменяет
> исполнителя. Это намеренная граница безопасности.

## Главные возможности

- ✅ извлечение **логических шагов (ЛШ)** с `source_anchor` и `origin`;
- ✅ **классификация входа**: executable procedure, requirements spec, architecture, weakly structured text;
- ✅ **нормализатор** со self-diff against source и режимом недоверия;
- ✅ построение графа зависимостей и **частичного порядка**;
- ✅ **многомерная модель рисков**: `risk_level` + `risk_tags` (SAFE, REVERSIBLE, DESTRUCTIVE_IRREVERSIBLE, SECRET_TOUCHING, …);
- ✅ **матрица действий** для каждого risk tag × execution mode (interactive/autonomous/sandbox/production);
- ✅ **профиль среды**: command policy (argv, deny/allow), path policy, network whitelist/denylist, secret masking;
- ✅ **чекпоинты**: `AIO` (атомарная операция), `VERIFY` (проверка), `MANUAL`;
- ✅ **evidence-модель** с хешами, redaction и assertions;
- ✅ **бюджет проверок** с формулой сложности и дедупликацией;
- ✅ **rollback** с подтверждением и стратегиями (snapshot, backup, revert);
- ✅ **retry strategies**: none, fixed, linear, exponential backoff;
- ✅ **регенерация плана** при пропуске задач с лимитом и блокировкой;
- ✅ **аудит** с адаптивным количеством раундов и классификацией изъянов;
- ✅ **управляемая деградация**: FULL_PLAN → PARTIAL_PLAN → PLAN_WITH_BLOCKERS → REJECT_*;
- ✅ машинно-читаемые **YAML/NDJSON** логи и финальный отчёт;
- ✅ глобальная skill-команда `/laptev-plan` во всех сессиях Hermes;
- ✅ совместимые aliases `/laptev_plan` и `/precision-planning`.

## Установка

### Рекомендуемый способ через npm

```bash
npm install -g @anatolijlaptev1991/precision-planning
precision-planning install
```

Установщик:

1. копирует `SKILL.md` в `~/.hermes/skills/software-development/laptev-plan/`;
2. добавляет `laptev-plan` в `HERMES_TUI_SKILLS` в `~/.hermes/.env`;
3. обновляет Windows User Environment Variable для Desktop/Tauri-пути;
4. регистрирует совместимые aliases `/laptev_plan` и `/precision-planning` → `/laptev-plan` в `config.yaml`;
5. не регистрирует `/laptev-plan` как quick command: эта команда создаётся Hermes skill scanner напрямую.

После установки создайте новую сессию Hermes командой `/new` или перезапустите
приложение.

### Проверка и удаление

```bash
precision-planning status
precision-planning uninstall
```

Для отдельного профиля Hermes можно указать домашний каталог явно:

```bash
precision-planning install --home "C:\\Users\\<user>\\.hermes\\profiles\\<profile>"
```

## Использование

В Hermes Agent:

```text
/laptev-plan
```

Это канонический skill-command, который обнаруживается из frontmatter
`name: laptev-plan` в общем каталоге `~/.hermes/skills/` и доступен после
перезапуска в любой новой сессии.

Совместимые aliases:

```text
/laptev_plan
/precision-planning
```

или сразу с задачей:

```text
/laptev-plan Подготовь план миграции этого сервиса на новую схему токенов.
```

## Что именно выдаёт скилл

### Логические шаги (ЛШ)

Каждая инструкция извлекается с привязкой к источнику, типом и risk tags:

```yaml
id: "LSH-001"
source_anchor:
  file: "input.md"
  line_start: 12
  line_end: 16
  quote_hash: "sha256:..."
type: "EXEC"
body: "Установить nginx"
origin: "EXPLICIT"
risk_tags: [PRIVILEGED, NETWORKED, REVERSIBLE]
```

### Частичный порядок

Эталон выполнения — не одна жёсткая последовательность, а набор допустимых
последовательностей, удовлетворяющих графу зависимостей.

### Модель рисков

Операция может иметь несколько risk tags одновременно. Для каждой комбинации
risk tag × execution mode матрица действий определяет: allow, require_confirmation
или deny.

```yaml
DESTRUCTIVE_IRREVERSIBLE:
  interactive: require_explicit_confirmation
  autonomous: deny
  sandbox: require_confirmation
  production: deny_by_default
```

### Evidence

Машинно-читаемая запись фактического результата: exit code, длительность, хеши
stdout/stderr, changed_resources, assertions, redactions.

### Файловая структура плана

```text
Plan_<plan_name>/
  plan_hierarchy.yaml
  source_manifest.yaml
  environment_profile.resolved.yaml
  Phase_01/
    phase_context.yaml
    phase_execution_log.ndjson
    tasks/
      task_01.yaml
  final_report.yaml
```

Все структурированные файлы — YAML или NDJSON. Markdown допускается только для
человекочитаемых пояснений, но не как единственный источник машинно-значимых
данных.

### Управляемая деградация

| Уровень | Значение |
|---|---|
| `FULL_PLAN` | Полный исполнимый план |
| `PARTIAL_PLAN` | План до первой неразрешимой зоны |
| `PLAN_WITH_BLOCKERS` | План содержит блокеры, требующие ручного решения |
| `DRY_RUN_PLAN` | Только структура и анализ, без исполнения |
| `REJECT_UNSAFE` | Отказ из-за риска вреда |
| `REJECT_UNPARSABLE` | Невозможно разобрать вход |
| `FATAL` | Аварийное завершение |

## Сравнение с планированием в популярных coding agents

Сравнение относится к базовым официально описанным режимам планирования продуктов,
а не к качеству конкретной модели. У каждого инструмента есть сильные стороны;
этот скилл не заявляет, что заменяет исполнение, sandbox или IDE.

| Инструмент | Официальный механизм | Что даёт этот скилл сверх базового режима |
|---|---|---|
| **Claude Code** | Plan mode читает файлы и предлагает план до изменений; пользователь затем разрешает выполнение. | Формальная трассировка ЛШ, многомерная модель рисков с матрицей действий, машинно-читаемые YAML/NDJSON артефакты, evidence с хешами и redaction, аудит с классификацией изъянов. |
| **Google Antigravity** | Implementation Plan оформляется как Artifact; его можно просматривать, комментировать и подтверждать кнопкой Proceed. | Независимость от desktop/UI-артефактов: переносимая файловая структура, command policy, path policy, профили среды, деградация и rollback с подтверждением. |
| **OpenAI Codex** | Plan mode собирает контекст, задаёт вопросы и строит план; для длинных задач можно применять `PLANS.md`, `AGENTS.md` и проверки. | Более строгий контракт: budget проверок с формулой сложности, регенерация с лимитом, retry strategies,NDJSON execution logs и честные статусы деградации. |
| **OpenCode** | Встроенный Plan agent ограничивает edits/bash, предлагает план, затем пользователь переключается в Build; поддерживаются итерация и subagents. | Планирование не привязано к режиму агента: один формат переносится между исполнителями, с command validation, secret masking и audit independence. |
| **ZCode** | Goal ориентирован на долгие задачи: агент разбивает цель, выполняет шаги, показывает прогресс и поддерживает удалённое управление. | Вместо долгоживущей цели — формализованная спецификация с ЛШ, частичным порядком, risk matrix, evidence и блокерами; меньше зависимости от конкретного workflow. |

### Честный вывод

- **Claude Code, Codex и OpenCode** сильнее как непосредственные coding agents:
  они читают репозиторий, меняют файлы и запускают тесты.
- **Antigravity** сильнее как визуальный workflow с Artifact Review и комментариями.
- **ZCode** сильнее как долгоживущая Goal-ориентированная среда с удалённым
  управлением.
- **Этот скилл** выигрывает как независимый слой формализации перед исполнением:
  он уменьшает пространство скрытых решений и делает план проверяемым,
  трассируемым и пригодным для передачи разным исполнителям.

## Источники сравнения

- [Claude Code — Common workflows](https://docs.anthropic.com/en/docs/claude-code/common-workflows)
- [Google Antigravity — Implementation Plan](https://antigravity.google/docs/implementation-plan)
- [Google Antigravity — Artifact Review](https://antigravity.google/docs/artifact-review)
- [OpenAI Codex — Best practices](https://developers.openai.com/codex/learn/best-practices)
- [OpenCode — Agents](https://opencode.ai/docs/agents/)
- [OpenCode — Intro and Plan mode](https://opencode.ai/docs/)
- [Z.AI — Developer Pack overview](https://docs.z.ai/devpack/overview)
- [Z.AI — GLM-5.2](https://docs.z.ai/guides/llm/glm-5.2)

## Структура репозитория

```text
precision-planning/
├── skill/SKILL.md              # laptev-plan v4.0.0 — полная спецификация скилла
├── bin/precision-planning.js   # npm CLI: install/status/uninstall
├── package.json                # npm-пакет
├── README.md                   # описание, установка и сравнение
├── CHANGELOG.md
└── LICENSE
```

## Совместимость

- Hermes Agent с пользовательскими скиллами;
- Windows 10/11, macOS и Linux;
- Node.js 18+ для npm-установщика;
- npm 9+.

На Windows установщик обновляет User Environment Variable через `setx`. Уже
запущенные процессы не получают новые переменные — требуется новый запуск Hermes.

## Разработка

```bash
git clone https://github.com/anatolijlaptev1991-ctrl/precision-planning.git
cd precision-planning
node bin/precision-planning.js status
npm pack --dry-run --json
```

## Лицензия

MIT — свободное использование, изменение и распространение с сохранением лицензии.
