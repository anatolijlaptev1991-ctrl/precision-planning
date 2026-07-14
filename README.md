<div align="center">

# 🧭 Precision Planning Skill v6

**Точный, последовательный, проверяемый и безопасный планировщик для Hermes Agent.**

[![License](https://img.shields.io/github/license/anatolijlaptev1991-ctrl/precision-planning?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/anatolijlaptev1991-ctrl/precision-planning?style=flat-square)](https://github.com/anatolijlaptev1991-ctrl/precision-planning/stargazers)
[![Version](https://img.shields.io/badge/skill-v6.0.0-6366f1?style=flat-square)](skill/SKILL.md)
[![Hermes](https://img.shields.io/badge/Hermes%20Agent-compatible-6366f1?style=flat-square)](https://github.com/NousResearch/hermes-agent)
[![npm](https://img.shields.io/npm/v/@anatolijlaptev1991/precision-planning?style=flat-square&label=npm)](https://www.npmjs.com/package/@anatolijlaptev1991/precision-planning)
[![Node](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)

</div>

---

## Описание

**Precision Planning Skill v6** превращает сложную спецификацию не в список общих
намерений, а в исполнимый план с трассировкой:

```text
Источник → требование → решение → задача → микрошаг → эффект → проверка
```

Скилл предназначен для Hermes Agent и особенно полезен, когда задача содержит
несколько файлов, компонентов, зависимостей, внешних систем, миграций, рисков или
должна быть передана другому агенту без скрытых предположений.

> Скилл создаёт план, но не выполняет запланированные действия и не подменяет
> исполнителя. Это намеренная граница безопасности.

## Главные возможности

- ✅ извлечение атомарных требований с `source_anchor`;
- ✅ разделение фактов, требований, ограничений, примеров и предположений;
- ✅ выявление неоднозначностей и противоречий;
- ✅ фиксация `Decision Record` до зависимых задач;
- ✅ построение явного графа зависимостей и частичного порядка;
- ✅ режимы `COMPACT`, `STANDARD` и `EXTENDED`;
- ✅ декомпозиция на фазы, задачи и микрошаги;
- ✅ один основной микрошаг — одна операция и один основной изменяемый ресурс;
- ✅ предусловия, постусловия, проверки и структурированное `evidence`;
- ✅ risk model: rollback, retry, подтверждения, блокеры и безопасная остановка;
- ✅ контроль конфликтов ресурсов и доказанный параллелизм;
- ✅ перепланирование затронутого подграфа при drift или пропуске задачи;
- ✅ финальная проверка полноты, логики, исполнимости и безопасности;
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

Совместимое имя с подчёркиванием:

```text
/laptev_plan
```

или сразу с задачей:

```text
/laptev-plan Подготовь план миграции этого сервиса на новую схему токенов.
```

Также сохранён совместимый alias:

```text
/precision-planning
```

Для небольшой безопасной задачи выбирается `COMPACT`; для обычной многошаговой
задачи — `STANDARD`; для миграций, интеграций и production-изменений — `EXTENDED`.

## Что именно выдаёт планировщик

### Требования

Каждое обязательство получает уникальный идентификатор, тип, источник, приоритет,
критерии приёмки и зависимости:

```yaml
id: REQ-001
type: FUNCTIONAL
statement: "Система сохраняет событие журнала."
origin: EXPLICIT
source_anchor:
  file: requirements.md
  section: "Журналирование"
priority: MUST
```

### Решения

Неопределённый выбор не передаётся исполнителю под видом шага. Сначала фиксируется
решение, альтернативы, основание и последствия.

### Микрошаги

Каждый шаг содержит точные входы, предусловия, действие, ожидаемый результат,
проверку, идемпотентность и поведение при ошибке.

### Безопасность

При несовпадении предусловия планировщик останавливает ветвь и создаёт блокер.
Неизвестное состояние не заменяется догадкой. Для удаления данных, production,
внешних эффектов и необратимых операций требуется явное подтверждение.

## Сравнение с планированием в популярных coding agents

Сравнение относится к базовым официально описанным режимам планирования продуктов,
а не к качеству конкретной модели. У каждого инструмента есть сильные стороны;
Precision Planning не заявляет, что заменяет исполнение, sandbox или IDE.

| Инструмент | Официальный механизм | Что даёт Precision Planning сверх базового режима |
|---|---|---|
| **Claude Code** | Plan mode читает файлы и предлагает план до изменений; пользователь затем разрешает выполнение. | Формальная трассировка «источник → требование → эффект → проверка», явные решения, risk/rollback/retry, блокеры и машинно-читаемое `evidence`, а не только согласуемый план в диалоге. |
| **Google Antigravity** | Implementation Plan оформляется как Artifact; его можно просматривать, комментировать и подтверждать кнопкой Proceed. | Независимость от desktop/UI-артефактов: план имеет переносимую структуру, критерии полноты, явные зависимости, атомарные шаги и безопасные переходы состояния. |
| **OpenAI Codex** | Plan mode собирает контекст, задаёт вопросы и строит план; для длинных задач можно применять `PLANS.md`, `AGENTS.md` и проверки. | Более строгий контракт результата: источник каждого требования, Decision Records, эффект на ресурс, проверка, rollback и честные статусы `READY`, `PARTIAL`, `PLAN_WITH_BLOCKERS`. |
| **OpenCode** | Встроенный Plan agent ограничивает edits/bash, предлагает план, затем пользователь переключается в Build; поддерживаются итерация и subagents. | Планирование не привязано к режиму агента или permission-профилю OpenCode: один формат переносится между исполнителями и заранее описывает failure behavior, evidence и перепланирование. |
| **ZCode** | Goal ориентирован на долгие задачи: агент разбивает цель, выполняет шаги, показывает прогресс и поддерживает удалённое управление. | Вместо только долгоживущей цели — проверяемая спецификация с атомами требований, явным покрытием, блокерами и критериями завершения; меньше зависимости от конкретного desktop/remote workflow. |

### Честный вывод

- **Claude Code, Codex и OpenCode** сильнее как непосредственные coding agents:
  они читают репозиторий, меняют файлы и запускают тесты.
- **Antigravity** сильнее как визуальный workflow с Artifact Review и комментариями.
- **ZCode** сильнее как долгоживущая Goal-ориентированная среда с удалённым
  управлением.
- **Precision Planning** выигрывает как независимый слой формализации перед
  исполнением: он уменьшает пространство скрытых решений и делает план
  проверяемым, трассируемым и пригодным для передачи разным исполнителям.

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
├── skill/SKILL.md              # laptev-plan / Precision Planning Skill v6.0.0
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
