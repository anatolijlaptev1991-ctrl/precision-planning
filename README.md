<div align="center">

# 🧭 laptev-plan

**Планировщик, который понятен человеку и исполним агентом.**

[![License](https://img.shields.io/github/license/anatolijlaptev1991-ctrl/precision-planning?style=flat-square)](LICENSE)
[![Skill](https://img.shields.io/badge/skill-v5.1.1-6366f1?style=flat-square)](skill/SKILL.md)
[![npm](https://img.shields.io/npm/v/@anatolijlaptev1991/precision-planning?style=flat-square&label=npm)](https://www.npmjs.com/package/@anatolijlaptev1991/precision-planning)
[![Hermes](https://img.shields.io/badge/Hermes%20Agent-compatible-6366f1?style=flat-square)](https://github.com/NousResearch/hermes-agent)
[![Node](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)

</div>

---

## Коротко

`laptev-plan` превращает обычное описание задачи в надёжный маршрут: что сделать,
в каком порядке, как проверить результат, какие есть риски и как вернуться назад.
Это не просто список советов в чате, а план с понятными шагами и доказательствами
того, что каждый шаг действительно выполнен.

Стандартный Plan mode в [Claude Code](https://docs.anthropic.com/en/docs/claude-code/common-workflows),
[Codex](https://developers.openai.com/codex/learn/best-practices),
[OpenCode](https://opencode.ai/docs/) и [Antigravity](https://antigravity.google/docs)
обычно помогает изучить проект и предложить порядок работы до начала изменений.
Это полезный черновик, но такой план часто остаётся в диалоге, UI или свободном
тексте конкретного приложения.

`laptev-plan` добавляет к такому подходу переносимый контракт исполнения:

- каждый пункт привязан к исходному тексту, а не придуман «для полноты»;
- большая задача раскладывается на маленькие действия, которые нельзя незаметно смешать;
- для каждого действия заранее указано, что считать успехом;
- результаты передаются между шагами через подписанные артефакты;
- риски, секреты, права доступа, повторные попытки и откат описаны заранее;
- перед стартом план проходит readiness gate;
- план не зависит от конкретного приложения, модели или имени провайдера.

Поэтому обычный Plan mode можно сравнить с черновым маршрутом, а `laptev-plan` —
с маршрутом, где у каждого участка есть координаты, контрольная точка, чек и
безопасный способ вернуться назад.

## Термины, которые встретятся дальше

| Термин | Короткое объяснение | Формальное проявление |
|---|---|---|
| Логический шаг (`LSH`) | Одна мысль из исходного описания | `source_anchor`, `origin` |
| Атомарный шаг | Одно маленькое действие | Один `action`, один вызов исполнителя |
| Evidence | Доказательство результата | Exit code, хеши и машинные проверки |
| Артефакт | Результат для следующего шага | `artifacts_registry.yaml` |
| Risk tag | Ярлык возможной опасности | Политика `allow` / `confirmation` / `deny` |
| Rollback | Возврат в прежнее состояние | Разрешённый `rollback_mode` |
| Readiness gate | Контрольный список перед стартом | R1–R8 → `READY` |
| Ограничения исполнителя | Что агент реально может обработать | `executor_constraints` |

## Как читать дальше

Первые абзацы объясняют идею обычным языком. Далее начинается нормативная
спецификация: поля YAML/NDJSON, закрытые списки и `done_criteria` являются
контрактом исполнения. `ОБЯЗАН` означает, что правило нельзя пропустить;
`ЗАПРЕЩЕНО` — действие недопустимо; `МОЖЕТ` — разрешённый, но необязательный
вариант. Если данных не хватает, результатом должен быть `BLOCKED`, а не догадка.

## Что получается на выходе

```text
Plan_<plan_name>/
  plan_hierarchy.yaml
  source_manifest.yaml
  skill_config.resolved.yaml
  environment_profile.resolved.yaml
  executor_profile.resolved.yaml
  artifacts_registry.yaml
  executor_readiness.yaml
  templates/atomic_step_prompt.md
  normalization/
  audit/
  Phase_01/
    phase_context.yaml
    phase_execution_log.ndjson
    tasks/task_01.yaml
    steps/step_0001.yaml
  final_report.yaml
```

Все машинно-значимые данные хранятся в YAML/NDJSON. Markdown используется для
пояснений, но не является единственным источником машинной истины.

## Версия 5.1.2: что изменилось принципиально

- **Атомарность обязательна для каждого плана.** Иерархия теперь:
  `Фаза → Задача → Атомарный шаг`.
- **Единая сущность шага.** Старые `AIO` и `VERIFY` больше не являются
  исполняемыми единицами. Шаг содержит `action` и `done_criteria` — единственный
  источник истины для проверки самого шага.
- **Интеграционные проверки сохранены отдельно:**
  `task_verifications`, `phase_verifications` и read-only `verification_batch`.
- **Модель-независимый исполнитель.** Нет классов `small_model`/`large_model`,
  имён моделей и порогов «по размеру модели». Используются измеримые
  `executor_constraints`: контекст, вывод, размер шага, структурированный ответ,
  число действий.
- **Автодетекция ограничений.** До генерации плана проверяются Ollama и
  совместимые локальные API; при отсутствии данных применяется консервативный
  профиль 4096/1024 с предупреждением `EXECUTOR_CONSTRAINTS_ASSUMED`.
- **Безопасный формат вывода.** `EDIT_FILE` требует unified diff и hash
  неизменённых областей; `APPEND_FILE` требует `APPEND_PAYLOAD`, который
  физически дописывает оркестратор; запрещены каналы скрытой мутации.
- **Единая иерархия retry.** Глобальный лимит → задача → шаг, с классификацией
  `error_class` и запретом автоматического retry для опасных/логических ошибок.
- **Четыре уровня rollback.** Шаг → задача → фаза → среда; используется самый
  локальный применимый откат.
- **Readiness gate.** Перед выдачей `FULL_PLAN` или `PARTIAL_PLAN` обязателен
  `executor_readiness.yaml` со статусом `READY` и восемью проверками R1–R8.
- **Upstream/hermetic gates.** Встроены правила Windows home-isolation,
  before/after hash-манифеста, artifact-path lint, drift до commit, exact
  staging allowlist, Git identity gate, fork/PR read-back и CI fork-approval.

## Основные гарантии

### 1. Трассируемость

Каждый логический шаг (`LSH`), задача, атомарный шаг и инфраструктурный элемент
имеет `origin` и `source_anchor`. Скилл не добавляет функциональные требования
от себя.

Допустимые источники:

```yaml
origin:
  - EXPLICIT
  - INFERRED
  - SYSTEM
  - USER_CONFIRMED
  - ASSUMPTION
  - LOW_CONFIDENCE_INFERENCE
```

Предположения не могут породить необратимые, привилегированные или внешние
побочные действия без явного подтверждения пользователя.

### 2. Атомарный контракт

Каждый шаг выполняется ровно одним вызовом исполнителя и содержит:

- `step_id`, `task_id`, `phase_id`, `origin`;
- один `action` из закрытого списка;
- `knowledge_boundary` с facts, inputs и `must_not_assume`;
- `context_pack` с хешами файлов и артефактов;
- `output_contract`;
- минимум один машинный `done_criteria`;
- `negative_constraints` для мутирующих действий;
- `risk_level`, `risk_tags`, `retry_policy`, `rollback`.

Закрытый список действий:

```text
CREATE_FILE       EDIT_FILE          APPEND_FILE
DELETE_FILE       WRITE_CONFIG_KEY   RUN_COMMAND
READ_FILE         ASSERT_STATE
```

Критерии атомарности C1–C8 запрещают несколько действий, несколько целей,
скрытый внешний контекст, неустранимую неоднозначность и превышение бюджета
исполнителя. Тривиальная задача, уже удовлетворяющая критериям, не дробится
искусственно.

### 3. Риск и политика безопасности

Риск описывается одновременно уровнем и тегами:

```yaml
risk_level: HIGH
risk_tags:
  - PRIVILEGED
  - NETWORKED
  - REVERSIBLE
```

Поддерживаются `SAFE`, `REVERSIBLE`, `DESTRUCTIVE_REVERSIBLE_WITH_SNAPSHOT`,
`DESTRUCTIVE_IRREVERSIBLE`, `DATA_LOSS_RISK`, `PRIVILEGED`, `SECRET_TOUCHING`,
`NETWORKED`, `EXTERNAL_SIDE_EFFECT`, `COMPLIANCE_SENSITIVE` и
`PRODUCTION_IMPACTING`.

Для каждой комбинации риска и режима (`interactive`, `autonomous`, `sandbox`,
`production`) действует матрица `allow` / `require_confirmation` / `deny`.
Секреты не попадают в журналы: stdout/stderr фильтруются, вместо значения
фиксируются тип, hash и видимый префикс.

### 4. Артефакты как единственный канал передачи

Исполнитель не имеет памяти между вызовами. Результат, необходимый следующему
шагу, публикуется в неизменяемом `artifacts_registry.yaml`:

```yaml
artifact_id: ART-0017
producer_step: AS-0038
path: artifacts/ART-0017_config_schema.yaml
sha256: sha256:...
consumers: [AS-0042]
```

Зависимость требует одновременно ребро в графе и ссылку на артефакт в inputs.
Хеши проверяются перед выдачей шага; рассинхронизация означает drift и требует
пересборки контракта.

### 5. Управляемая деградация

| Уровень | Смысл |
|---|---|
| `FULL_PLAN` | Полный исполнимый план, readiness gate пройден |
| `PARTIAL_PLAN` | Безопасно усечённый план до неразрешимой зоны |
| `PLAN_WITH_BLOCKERS` | Исполнение остановлено до ручного разрешения |
| `DRY_RUN_PLAN` | Только структура и анализ, без автозапуска команд |
| `REJECT_UNSAFE` | Вход или действие небезопасны |
| `REJECT_UNPARSABLE` | Вход нельзя безопасно разобрать |
| `REJECT_NO_EXECUTABLE_LOGIC` | В источнике нет исполняемой логики |
| `REJECT_CONTRADICTORY` | Противоречия не разрешены |
| `FATAL` | Безопасное продолжение фактически невозможно |

Если нормализатор слабоструктурированного текста недоступен, скилл не угадывает:
он либо использует безопасный детерминированный fallback, либо создаёт блокер/
отказ.

## Установка

Текущий npm-пакет содержит не только ядро, но и все reference-файлы v5.1.2:
схемы артефактов, контракт атомарного шага, runtime-протокол, executor
detection, нормативный Rust-пример и upstream-hermetic checklist.

```bash
npm install -g @anatolijlaptev1991/precision-planning
precision-planning install
```

Установщик:

1. копирует всё дерево `skill/` в
   `~/.hermes/skills/software-development/laptev-plan/`;
2. добавляет `laptev-plan` в `HERMES_TUI_SKILLS`;
3. обновляет Windows User Environment Variable для стандартного Hermes home;
4. поддерживает aliases `/laptev_plan` и `/precision-planning`, направляя их
   на канонический `/laptev-plan`;
5. не регистрирует `/laptev-plan` как отдельный quick command — его обнаруживает
   Hermes skill scanner;
6. просит новую сессию после установки.

Для отдельного Hermes-профиля или тестового каталога:

```bash
precision-planning install --home "C:\Users\<user>\.hermes\profiles\<profile>"
```

При явном `--home` установщик **не меняет глобальную Windows-переменную** —
это безопасно для изолированных профилей и тестов.

Проверка и удаление:

```bash
precision-planning status
precision-planning uninstall
precision-planning --version
```

`status` показывает версию skill, наличие reference tree, aliases и preload.

## Использование в Hermes

Каноническая команда и имя скилла:

```text
/laptev-plan
```

С задачей:

```text
/laptev-plan Подготовь план миграции сервиса на новую схему токенов.
```

Совместимые aliases:

```text
/laptev_plan
/precision-planning
```

После установки или обновления создайте новую сессию `/new` либо перезапустите
Hermes Desktop: текущий загрузчик skills кэшируется на время сессии.

## Конфигурация

Рекомендуемый `skill_config.yaml`:

```yaml
skill_config:
  schema_version: "1.1"
  execution_mode: interactive
  output_format: yaml
  log_format: ndjson
  max_phase_attempts: 10
  max_task_attempts: 10
  max_regenerations_per_plan: 3
  executor:
    detection: auto
    constraints:
      max_context_tokens: null
      max_output_tokens: null
      max_new_lines_per_step: null
      structured_output_required: true
      maximum_actions_per_step: 1
      external_context_allowed: false
    granularity: atomic
    step_retry_max: 3
    drift_check_interval: 10
    escalation: user
```

Приоритет `executor_constraints`:

1. Явные ограничения в конфигурации.
2. Подтверждённые пользователем ограничения.
3. Автодетекция Ollama или совместимого API.
4. Консервативный default: context 4096, output 1024, до 60 новых строк.

Имя модели фиксируется только информативно в evidence и не определяет пороги.

## Аудит и исполнение

Аудиторы работают в режиме `REPORT_ONLY` и не изменяют план или систему.
Базовые направления: `logic_compliance`, `antifragility`, `architecture`.
Дополнительные направления активируются security/performance/data-integrity/
network/compliance тегами.

Аудит выполняется только для `FULL_PLAN` и `PARTIAL_PLAN`; для blockers, dry-run,
reject и fatal причина пропуска фиксируется в `audit_summary.yaml`.

Runtime-протокол разделяет роли:

- оркестратор управляет фазами, блокерами, регенерацией и итогом;
- агент фазы проверяет rollback, locks и интеграционные проверки;
- агент задачи исполняет шаги и retry/rollback;
- исполнитель получает ровно один контракт и отвечает `STEP_OK` или `STEP_BLOCKED`.

## Upstream-планы и Windows hermetic-проверки

В поставку включён `references/upstream-hermetic-tests.md`. Он обязателен для
планов, где direct pytest и canonical/CI-parity runner ведут себя по-разному.

Правила включают:

- актуализацию `origin/main` до диагностики;
- отдельный worktree и отдельный Hermes Desktop Project;
- разделение direct/canonical/clean-run контуров;
- sandbox для `HOME`, `USERPROFILE`, `HOMEDRIVE`, `HOMEPATH`;
- before/after hash-манифест реальных `~/.hermes` и legacy-каталогов;
- проверку `artifact_id → registry.path → input.ref`;
- запрет незаполненных `<placeholder>` в исполняемых командах;
- drift-check до staging и commit;
- exact allowlist для staged-файлов;
- Git identity gate без подстановки чужого автора;
- классификацию process-noise отдельно от test-pass;
- различение upstream remote и пользовательского fork;
- read-back branch/commit/PR и честную классификацию `action_required` fork-gate.

External CI blocker не превращается в ложный успех: допустим итог
`COMPLETED_WITH_EXTERNAL_CI_BLOCKED`, если локальные gates и handles проверены,
а upstream approval недоступен.

## Структура поставки

```text
precision-planning/
├── skill/
│   ├── SKILL.md
│   ├── CHANGELOG.md
│   ├── reference/
│   │   ├── schemas/plan_artifacts.md
│   │   ├── schemas/atomic_step.md
│   │   ├── protocol/execution.md
│   │   ├── protocol/executor_detection.md
│   │   └── examples/rust_config.md
│   └── references/upstream-hermetic-tests.md
├── bin/precision-planning.js
├── package.json
├── package-lock.json
├── README.md
├── CHANGELOG.md
└── LICENSE
```

## Разработка и локальная проверка

```bash
git clone https://github.com/anatolijlaptev1991-ctrl/precision-planning.git
cd precision-planning
node --check bin/precision-planning.js
node bin/precision-planning.js --version
node bin/precision-planning.js help
npm pack --dry-run --json
```

Для безопасного smoke-теста установщика используйте временный home:

```bash
precision-planning install --home "$TEMP_HERMES_HOME"
precision-planning status --home "$TEMP_HERMES_HOME"
```

Проверяйте, что `skill/SKILL.md` и установленный `SKILL.md` совпадают по
SHA-256, а reference-файлы присутствуют в целевом каталоге.

## Лицензия

MIT — свободное использование, изменение и распространение с сохранением
лицензии.
