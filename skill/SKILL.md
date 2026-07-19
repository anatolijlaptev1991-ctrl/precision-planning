---
name: laptev-plan
version: 5.1.0
license: MIT
description: >-
  Составляет формализованный исполнимый план выполнения задачи. Используй,
  когда пользователь просит: составить план, спланировать задачу, разбить
  задачу на шаги, декомпозировать, создать план внедрения, plan, planning,
  atomic plan, разложить на атомарные шаги, сделать пошаговый план.
  Преобразует .md файлы с описанием задачи, процедуры или требований в
  проверяемый и аудируемый план с машинно-читаемыми YAML/NDJSON-артефактами,
  моделью рисков, управляемой деградацией и обязательной атомарной
  декомпозицией под суб-агентов и ограниченных исполнителей: контракты
  шагов, реестр артефактов, gate пригодности плана. Модель-независим:
  исполнитель описывается только измеримыми ограничениями (executor_constraints).
---

# СКИЛЛ ГЕНЕРАЦИИ ПЛАНА ВЫПОЛНЕНИЯ ЗАДАЧИ

**Версия 5.1 — модульная спецификация: компактное ядро + reference-файлы. Обязательная атомарная декомпозиция для всех планов. Модель-независимый профиль исполнителя. Единая сущность шага (AIO и VERIFY упразднены). Иерархии retry/rollback с классификацией ошибок.**

**Модульность.** Настоящий файл — ядро (~950 строк): нормативные правила, принципы, алгоритм. Полные схемы, протокол исполнения и примеры вынесены в reference-файлы и загружаются по требованию:

| Файл | Содержимое | Когда загружать |
|---|---|---|
| `reference/schemas/plan_artifacts.md` | Полные YAML-схемы всех артефактов плана | При генерации файловой структуры |
| `reference/schemas/atomic_step.md` | Полный контракт шага, форматы вывода, шаблон промпта, реестр артефактов | При декомпозиции в шаги |
| `reference/protocol/execution.md` | Runtime-протокол оркестратора, иерархии retry/rollback, error_class | Оркестратором при исполнении |
| `reference/protocol/executor_detection.md` | Процедура определения ограничений исполнителя (Ollama и совместимые) | До генерации плана (шаг 4б) |
| `reference/examples/rust_config.md` | Сквозной нормативный пример декомпозиции и контрактов | При обучении/калибровке планировщика |

---

# 0. Назначение скилла

Скилл преобразует один или несколько `.md` файлов с описанием задачи, процедуры, требований или архитектурной логики в формализованный, исполнимый, проверяемый и аудируемый план выполнения.

Результат — самодостаточная файловая структура `Plan_<plan_name>/`, содержащая: иерархию фаз, задач и атомарных шагов; машинно-читаемые YAML/NDJSON-артефакты; зависимости и частичный порядок; проверки эффектов и инвариантов; модель рисков; профили среды и исполнителя; правила отката; стратегию повторов; журналы выполнения; evidence-модель; реестр межшаговых артефактов; аудит и финальный отчёт.

Скилл не выполняет задачу сам по себе. Он генерирует план и контракты для оркестратора и агентов-исполнителей.

Начиная с версии 5.1 **атомарная декомпозиция обязательна для всех планов без исключения**: каждая задача разбивается на шаги, удовлетворяющие критериям атомарности §10. Это гарантирует пригодность плана для исполнения суб-агентами и ограниченными исполнителями, которым нужны чёткие контракты без пространства для додумывания.

**Модель-независимость.** Спецификация не содержит имён, классов и размеров моделей. Исполнитель описывается только измеримыми ограничениями (`executor_constraints`, §3.3): лимит контекста, лимит вывода, требование структурированного вывода. Пороги атомарности выводятся из ограничений, а не назначаются по классу исполнителя.

---

# 1. Термины и базовые сущности

## 1.1. Исходный материал

Один или несколько `.md` файлов либо директория, переданные пользователем. Исходный материал — единственный источник функциональных требований. Скилл не имеет права добавлять новые функциональные требования от себя.

## 1.2. Логический шаг, ЛШ

Логический шаг (`LSH`) — минимальная смысловая инструкция, извлечённая из исходного материала или нормализованной структуры.

```yaml
id: "LSH-001"
type: "EXEC"
body: "Установить пакет nginx"
origin: "EXPLICIT"
dependencies: []
```

## 1.3. Фаза

Логически завершённый крупный этап плана, содержащий одну или несколько задач. Фазы выполняются последовательно, если частичный порядок не допускает иного. Пропуск фазы запрещён и ведёт к аварийному завершению с сохранением частичных результатов.

## 1.4. Задача

Логически завершённая единица работы внутри фазы: риски, ресурсы, изоляция, retry-стратегия, интеграционные проверки. Задача включает один или несколько атомарных шагов.

## 1.5. Атомарный шаг, АШ

Атомарный шаг (`atomic_step`) — минимальная и единственная исполняемая единица плана, рассчитанная ровно на один вызов агента-исполнителя. Полное определение, критерии атомарности и контракт — §10–§11.

**Упразднено в v5.1:** типы чекпоинтов `AIO` (атомарная исполняемая операция) и `VERIFY` как исполняемые единицы задачи. AIO заменена шагом с `action.type: RUN_COMMAND`; проверка шага живёт в его `done_criteria` (единственный источник истины). Интеграционные проверки уровня задачи/фазы — `task_verifications` / `phase_verifications` — сохранены как отдельная легитимная роль: они охватывают несколько шагов и не дублируют `done_criteria`.

## 1.6. Evidence

Машинно-читаемая запись фактического результата выполнения шага. Строгая структура, допускающая автоматическую проверку; не свободный текст. Схема — `reference/schemas/plan_artifacts.md` §5.

## 1.7. Частичный порядок

Граф зависимостей между ЛШ, задачами или шагами. Эталон выполнения — не одна жёсткая последовательность, а набор допустимых последовательностей, удовлетворяющих зависимостям.

## 1.8. Артефакт

Именованный неизменяемый результат шага, зафиксированный в реестре артефактов и служащий единственным легальным каналом передачи данных между шагами (§11.4).

## 1.9. Профиль исполнителя

`executor_profile` — описание измеримых ограничений агента-исполнителя, против которого план проверяется так же строго, как против профиля среды (§3.3).

## 1.10. Интеграционная проверка

Проверка уровня задачи (`task_verifications`) или фазы (`phase_verifications`), охватывающая совокупный результат нескольких шагов. Не является исполняемой единицей и не дублирует `done_criteria` шагов (принцип дедупликации §7.3).

---

# 2. Фундаментальные принципы

## 2.1. Незыблемость исходной логики

План — детерминированное развёртывание исходной логики.

Допустимые контролируемые отклонения:

1. **Пропуск задачи пользователем** — регенерация оставшейся части плана, если лимит регенераций не исчерпан.
2. **Пропуск фазы** — запрещён; аварийное завершение с сохранением частичных результатов.
3. **Отклонение агента от плана** — только для предотвращения вреда, нарушения безопасности или разрушения состояния; фиксируется в логах и требует последующей верификации.

## 2.2. Прозрачность происхождения каждого элемента

Каждый ЛШ, задача, шаг, проверка, аудит-вывод и инфраструктурный элемент обязаны иметь поле `origin`:

```yaml
origin:
  enum:
    - EXPLICIT                  # дословно извлечено из исходного материала
    - INFERRED                  # выведено из структуры, порядка, ссылок, контекста
    - SYSTEM                    # добавлено скиллом: проверка, логирование, аудит, rollback, evidence
    - USER_CONFIRMED            # подтверждено пользователем
    - ASSUMPTION                # допущение с недостаточной уверенностью
    - LOW_CONFIDENCE_INFERENCE  # слабый вывод, требующий осторожности
```

Правила:

* `ASSUMPTION` и `LOW_CONFIDENCE_INFERENCE` не могут порождать `DESTRUCTIVE`, `DESTRUCTIVE_IRREVERSIBLE`, `PRIVILEGED`, `SECRET_TOUCHING` или `EXTERNAL_SIDE_EFFECT` действия без явного подтверждения пользователя.
* Любой элемент без `source_anchor` и без `origin: SYSTEM` считается недоверенным и не допускается к исполнению.
* Любое пользовательское подтверждение фиксируется как отдельное событие в журнале.

## 2.3. Универсальность с обязательной классификацией входа

Перед генерацией плана скилл классифицирует вход:

```yaml
input_class:
  enum:
    - EXECUTABLE_PROCEDURE        # → генерация плана напрямую
    - REQUIREMENTS_SPECIFICATION  # → задачи реализации, проверки, критерии завершения
    - ARCHITECTURE_DESCRIPTION    # → план анализа/валидации/реализации при наличии исполняемых намерений
    - WEAKLY_STRUCTURED_TEXT      # → запуск нормализатора
    - UNPARSABLE                  # → REJECT_UNPARSABLE
    - NO_EXECUTABLE_LOGIC         # → REJECT_NO_EXECUTABLE_LOGIC
    - CONTRADICTORY               # → запрос пользователя; если неразрешимо — REJECT_CONTRADICTORY
    - UNSAFE                      # → REJECT_UNSAFE
```

## 2.4. Нормализатор и режим недоверия

Если вход слабоструктурирован, скилл может использовать внешний LLM-нормализатор.

Нормализатору разрешено: структурировать текст; выделять ЛШ; выделять зависимости; помечать неопределённости и предположения; формировать промежуточный JSON/YAML.

Нормализатору запрещено: добавлять новые функциональные требования; заменять исходную логику; скрывать неоднозначности; превращать предположения в факты; создавать исполняемые действия без `source_anchor`.

Каждый результат нормализации обязан пройти self-diff against source:

```yaml
normalization_audit:
  source_fragment_id: "SRC-001"
  normalized_lsh_ids: ["LSH-001"]
  source_anchor:
    file: "input.md"
    line_start: 10
    line_end: 15
    quote_hash: "sha256:..."
  added_requirements: []
  assumptions:
    - id: "ASM-001"
      text: "..."
      confidence: 0.42
  low_confidence_items: ["LSH-004"]
  confirmation_required: true
```

Если найден ЛШ без `source_anchor`, он автоматически получает `origin: ASSUMPTION` и не допускается к необратимым действиям.

## 2.5. Fallback при недоступности нормализатора

Если нормализатор недоступен, не отвечает, превышает таймаут или возвращает невалидный результат:

1. Если вход можно разобрать детерминированно без LLM — скилл продолжает в режиме `PARTIAL_PLAN` или `PLAN_WITH_BLOCKERS`, помечая все сомнительные элементы.
2. Если режим интерактивный — скилл запрашивает ручное структурирование:

```yaml
steps:
  - id: "manual-1"
    text: "..."
    dependencies: []
    risk_hint: "SAFE"
```

3. Если пользователь не предоставляет структурирование или режим автономный — `REJECT_UNPARSABLE`:

```yaml
reject_reason:
  code: "NORMALIZER_UNAVAILABLE"
  message: "Вход слабоструктурирован, а нормализатор недоступен. Без нормализации невозможно безопасно извлечь исполняемую логику."
```

Скилл не должен генерировать опасный план на основе неразобранного слабоструктурированного текста.

## 2.6. Замкнутая вселенная исполнителя

Промпт атомарного шага — полный и единственный источник истины для исполнителя. Планировщик обязан материализовать в контракте шага всё необходимое для его выполнения; исполнитель не обязан и не вправе опираться на знания вне контракта (§11.2, §11.6).

## 2.7. Максимальная атомарность без надуманного дробления

Атомарная декомпозиция (§10) обязательна для всех планов. Максимальная атомарность — это **запрет шагов, нарушающих критерии**, а не принудительное дробление тривиальных задач: если задача атомарна сама, план из одного шага легален.

---

# 3. Входные параметры и конфигурация

## 3.1. Обязательные входные параметры

```yaml
required_inputs:
  source:
    type: "file_or_directory"
    allowed_extensions: [".md"]
  environment_profile:
    type: "capabilities_yaml"
```

## 3.2. Рекомендуемый конфигурационный файл

Пользователь может передать `skill_config.yaml`. Если не передан — значения по умолчанию.

```yaml
skill_config:
  schema_version: "1.1"
  plan_name: null
  execution_mode: "interactive"     # interactive/autonomous/sandbox/production
  output_format: "yaml"
  log_format: "ndjson"
  max_phase_attempts: 10
  max_task_attempts: 10
  max_regenerations_per_plan: 3
  manual_test_timeout_seconds: 1800
  normalizer_timeout_seconds: 120
  normalizer_max_retries: 2
  coverage_budget:
    max_checks_per_effect: 3
    base_checks_per_lsh: 1
    risk_multiplier:
      SAFE: 1.0
      REVERSIBLE: 1.2
      DESTRUCTIVE_REVERSIBLE_WITH_SNAPSHOT: 1.8
      DESTRUCTIVE_IRREVERSIBLE: 2.5
      PRIVILEGED: 1.8
      SECRET_TOUCHING: 2.0
      NETWORKED: 1.5
      EXTERNAL_SIDE_EFFECT: 2.3
    max_total_checks_warning_formula: "ceil(base_lsh_count * base_checks_per_lsh * avg_risk_multiplier * environment_multiplier * dependency_multiplier * 4)"
    hard_max_total_checks: null
  audit:
    max_rounds: 5
    min_rounds: 1
    adaptive: true
  executor:
    detection: "auto"               # auto/off — автодетекция ограничений (§3.3)
    preferred_model: null           # информативная подсказка для детекции; на пороги не влияет
    constraints:                    # если заданы явно — детекция не выполняется
      max_context_tokens: null
      max_output_tokens: null
      max_new_lines_per_step: null
      structured_output_required: true
      maximum_actions_per_step: 1
      external_context_allowed: false
    granularity: "atomic"           # atomic/micro — обязательная атомарность; standard упразднён
    step_retry_max: 3
    drift_check_interval: 10
    escalation: "user"              # user/escalate_constraints/block
    generation:
      temperature: 0.1
      seed: null
```

Правила:

* `granularity` — не переключатель «вкл/выкл» атомарности (она обязательна всегда), а набор порогов: `micro` ужесточает `max_new_lines_per_step` до 60 и коэффициент контекста до 0.6.
* `escalation: escalate_constraints` — заблокированный шаг передаётся исполнителю с более широкими ограничениями с тем же контрактом.
* `preferred_model` и любые сведения о модели — информативны (фиксируются в evidence) и нормативно не используются.

## 3.3. Профиль исполнителя: executor_constraints

Ограничения исполнителя определяются **до генерации плана** (шаг 4б алгоритма §24) по процедуре `reference/protocol/executor_detection.md`. Приоритет источников:

1. Явно заданный `skill_config.executor.constraints`.
2. Явный выбор пользователя в интерактивном режиме (`USER_CONFIRMED`).
3. Автодетекция локального провайдера (Ollama и совместимые API): список установленных моделей, `context_length`, консервативный вывод ограничений.
4. Консервативный дефолт: `max_context_tokens: 4096`, `max_output_tokens: 1024`, `max_new_lines_per_step: 60` (режим `micro`).

Скилл не вшивает списки «популярных моделей»: они устаревают и нарушают модель-независимость. Перечисляется только реально обнаруженное в среде.

Результат — `executor_profile.resolved.yaml` (схема — `reference/protocol/executor_detection.md` §4). Если источник — дефолт, gate §12 добавляет предупреждение `EXECUTOR_CONSTRAINTS_ASSUMED`.

## 3.4. Формула бюджета проверок

`max_total_checks_warning` вычисляется как функция сложности:

```yaml
max_total_checks_warning:
  formula: >
    ceil(max(50, base_lsh_count * base_checks_per_lsh
      * avg_risk_multiplier * environment_multiplier
      * dependency_multiplier * 4))

complexity_metrics:
  base_lsh_count: "количество ЛШ"
  base_checks_per_lsh: "из skill_config, по умолчанию 1"
  avg_risk_multiplier: "среднее по risk_tags"
  environment_multiplier:
    single_environment: 1.0
    multiple_profiles: "1.0 + 0.25 * additional_profiles_count"
  dependency_multiplier:
    low: 1.0
    medium: 1.25
    high: 1.5
```

Явно заданное пользователем значение имеет приоритет над формулой. При превышении вычисленного бюджета: скилл фиксирует предупреждение, применяет дедупликацию, при необходимости понижает план до `PARTIAL_PLAN` с указанием усечённых проверок.

---

# 4. Уровни деградации

```yaml
degradation_level:
  enum:
    - FULL_PLAN
    - PARTIAL_PLAN
    - PLAN_WITH_BLOCKERS
    - DRY_RUN_PLAN
    - REJECT_UNSAFE
    - REJECT_UNPARSABLE
    - REJECT_NO_EXECUTABLE_LOGIC
    - REJECT_CONTRADICTORY
    - FATAL
```

Значения:

* `FULL_PLAN` — полный исполнимый план.
* `PARTIAL_PLAN` — план до первой неразрешимой зоны или с безопасно усечёнными элементами.
* `PLAN_WITH_BLOCKERS` — план содержит блокеры; исполнение приостановлено до ручного разрешения.
* `DRY_RUN_PLAN` — только структура и анализ, без исполнения; никогда не содержит команд к автоматическому выполнению.
* `REJECT_UNSAFE` — отказ из-за риска вреда.
* `REJECT_UNPARSABLE` — невозможно разобрать вход.
* `REJECT_NO_EXECUTABLE_LOGIC` — нет исполняемой логики.
* `REJECT_CONTRADICTORY` — неразрешимые противоречия.
* `FATAL` — аварийное завершение: нарушение безопасности, невозможность отката, исчерпание критического лимита. Применяется только при фактической невозможности продолжать безопасно.

---

# 5. Модель рисков и политика безопасности

## 5.1. Многомерная модель риска

Операция может иметь несколько risk tags одновременно. Запрещено использовать только одно поле `risk_level` для описания всей природы риска.

```yaml
risk_level:
  enum: [LOW, MEDIUM, HIGH, CRITICAL]

risk_tags:
  allowed:
    - SAFE                                # нет побочных эффектов
    - REVERSIBLE                          # откат штатным способом
    - DESTRUCTIVE_REVERSIBLE_WITH_SNAPSHOT# разрушительно, но есть проверенный snapshot
    - DESTRUCTIVE_IRREVERSIBLE            # необратимо
    - DATA_LOSS_RISK
    - PRIVILEGED                          # повышенные права
    - SECRET_TOUCHING                     # секреты, токены, ключи, пароли
    - NETWORKED
    - EXTERNAL_SIDE_EFFECT                # внешние системы, пользователи, платежи, письма, API
    - COMPLIANCE_SENSITIVE
    - PRODUCTION_IMPACTING
```

Если применимо несколько тегов, используется самый строгий режим из всех.

## 5.2. Матрица действий

```yaml
risk_policy_matrix:
  SAFE:
    interactive: allow
    autonomous: allow
    sandbox: allow
    production: allow
  REVERSIBLE:
    interactive: allow
    autonomous: allow_if_rollback_available
    sandbox: allow
    production: allow_with_log
  DESTRUCTIVE_REVERSIBLE_WITH_SNAPSHOT:
    interactive: require_confirmation
    autonomous: deny_unless_sandbox
    sandbox: allow_with_verified_rollback
    production: require_confirmation_and_verified_rollback
  DESTRUCTIVE_IRREVERSIBLE:
    interactive: require_explicit_confirmation
    autonomous: deny
    sandbox: require_confirmation
    production: deny_by_default
  DATA_LOSS_RISK:
    interactive: require_confirmation_and_backup
    autonomous: deny
    sandbox: require_backup_or_snapshot
    production: require_backup_snapshot_and_final_confirmation
  PRIVILEGED:
    interactive: require_confirmation
    autonomous: deny_by_default
    sandbox: require_confirmation
    production: require_confirmation
  SECRET_TOUCHING:
    interactive: mask_output
    autonomous: forbid_secret_output
    sandbox: restricted
    production: strict_control
  NETWORKED:
    interactive: allow
    autonomous: allow_only_whitelist
    sandbox: allow
    production: restricted
  EXTERNAL_SIDE_EFFECT:
    interactive: require_confirmation
    autonomous: deny_by_default
    sandbox: mock_or_require_confirmation
    production: require_explicit_confirmation
  COMPLIANCE_SENSITIVE:
    interactive: require_confirmation
    autonomous: deny_by_default
    sandbox: restricted
    production: strict_control
  PRODUCTION_IMPACTING:
    interactive: require_confirmation
    autonomous: deny_by_default
    sandbox: not_applicable
    production: require_explicit_confirmation_and_change_log
```

## 5.3. Rollback confirmation

Профиль среды обязан содержать `require_rollback_confirmation: true|false`. Если `true`, агент обязан запросить подтверждение перед откатом для операций с тегами `REVERSIBLE`, `DESTRUCTIVE_REVERSIBLE_WITH_SNAPSHOT`, `DATA_LOSS_RISK`, `PRODUCTION_IMPACTING`. Поле имеет приоритет над автоматическим откатом, разрешённым матрицей. В автономном режиме при необходимости подтверждения отката выполнение переводится в `PLAN_WITH_BLOCKERS`.

## 5.4. Секреты

Секреты: API keys, tokens, passwords, private keys, session cookies, credentials, connection strings с паролями, OAuth secrets, любые значения по secret-patterns профиля среды.

Правила: секреты не записываются в логи; stdout/stderr фильтруются до записи; вместо значения фиксируется маркер:

```yaml
redacted_secret:
  kind: "token"
  hash: "sha256:..."
  visible_prefix: "sk-..."
  redacted: true
```

---

# 6. Профиль среды исполнения

Обязательная схема `environment_profile.yaml` (permissions, rollback, network_policy, secret_policy, timeout_policy, command_policy, path_policy, validation) и правила проверки команд (argv-контракт, приоритет forbidden над allowed, match modes, запрет shell без разрешения) — в `reference/schemas/plan_artifacts.md` §1.

Ключевые нормативные правила:

1. Команды хранятся как `argv`, не как свободная shell-строка.
2. Проверка `forbidden` выполняется до `allowed`; запрещённая команда всегда имеет приоритет.
3. Команда без успешной валидации переводит задачу в `BLOCKED`.

---

# 7. Загрузка, валидация и классификация исходных данных

## 7.1. Загрузка файлов

Скилл обязан: прочитать все `.md` файлы в UTF-8; проверить существование и непустоту; вычислить SHA-256 каждого файла и общую контрольную сумму; сохранить список в `plan_hierarchy.yaml`.

## 7.2. Определение имени плана

```yaml
plan_name:
  priority:
    - explicit_user_parameter
    - skill_config.plan_name
    - sanitized_first_file_name
    - combined_sha256_short
```

Корневая папка: `Plan_<plan_name>/`.

## 7.3. Классификация

```yaml
classification:
  input_class: "EXECUTABLE_PROCEDURE"
  confidence: 0.91
  reasons:
    - "Содержит последовательные инструкции"
    - "Есть команды и ожидаемые результаты"
  requires_normalization: false
```

При confidence ниже `0.7` вход считается слабоструктурированным и требует нормализации или подтверждения пользователя.

---

# 8. Извлечение ЛШ и построение частичного порядка

## 8.1. Схема ЛШ

```yaml
lsh:
  id: "LSH-001"
  source_file: "input.md"
  source_anchor:
    file: "input.md"
    line_start: 12
    line_end: 16
    quote_hash: "sha256:..."
  type: "EXEC"
  body: "Установить nginx"
  normalized_body: "Install nginx package"
  dependencies: []
  resources:
    - type: "package"
      name: "nginx"
  annotations: []
  origin: "EXPLICIT"
  confidence: 1.0
  risk_tags: [PRIVILEGED, NETWORKED, REVERSIBLE]
```

## 8.2. Типы ЛШ

`EXEC`, `CONFIG`, `ANALYZE`, `REFACTOR`, `CONDITION`, `LOOP`, `WAIT`, `INPUT`, `ASSERT`, `TEST`, `DOCUMENT`, `MIGRATE`, `CLEANUP`, `ROLLBACK`.

## 8.3. Построение графа зависимостей

Зависимости определяются по: явному порядку в тексте; ссылкам на файлы; изменяемым ресурсам; переменным; результатам предыдущих шагов; транзакционным группам; пользовательским аннотациям; рискам конфликтов.

```yaml
partial_order:
  nodes: ["LSH-001", "LSH-002"]
  edges:
    - from: "LSH-001"
      to: "LSH-002"
      reason: "LSH-002 использует пакет, установленный в LSH-001"
```

Циклы: допустимый `LOOP` разворачивается по правилам §9; цикл-противоречие — запрос уточнения; если невозможно — `PLAN_WITH_BLOCKERS` или `REJECT_CONTRADICTORY`.

---

# 9. Обработка циклов

Для каждого `LOOP` требуется конечная граница. Источники по приоритету: явная аннотация `<!-- max_iterations: 10 -->`; известный конечный список; числовой диапазон; подтверждение пользователя; блокер.

Если граница не определена:

```yaml
blocker:
  code: "UNBOUNDED_LOOP"
  lsh_id: "LSH-010"
  message: "Цикл не имеет конечной границы. Требуется указать max_iterations."
```

План переводится в `PLAN_WITH_BLOCKERS`.

---

# 10. Атомарная декомпозиция (обязательна для всех планов)

## 10.1. Иерархия

```text
Фаза → Задача → Атомарный шаг → (ровно одно действие + машинные проверки)
```

* Задача — логическая единица (риски, retry, ресурсы, изоляция). Шаг — исполняемая единица.
* Каждый шаг принадлежит ровно одной задаче.
* Проверка шага — его `done_criteria` (единственный источник истины для проверки шага).
* Интеграционные проверки уровня задачи/фазы (`task_verifications`, `phase_verifications`) охватывают несколько шагов и не дублируют `done_criteria`.
* Двустороннее покрытие обязательно: каждый ЛШ отображён минимум в один шаг; каждый шаг ссылается минимум на один ЛШ. Сиротские шаги и непокрытые ЛШ — дефекты плана (gate R7).

## 10.2. Критерии атомарности

Шаг признаётся атомарным только при одновременном выполнении всех критериев.

| Код | Критерий | Требование |
|---|---|---|
| C1 | SINGLE_ACTION | Ровно один тип действия из закрытого списка: `CREATE_FILE`, `EDIT_FILE`, `APPEND_FILE`, `DELETE_FILE`, `WRITE_CONFIG_KEY`, `RUN_COMMAND`, `READ_FILE`, `ASSERT_STATE` |
| C2 | SINGLE_TARGET | Не более одного целевого файла или ресурса (кроме `RUN_COMMAND` и `ASSERT_STATE`) |
| C3 | SELF_CONTAINED | Шаг содержит весь контекст; исполнителю не требуются другие шаги, план целиком или исходный `.md` |
| C4 | MACHINE_VERIFIABLE | Минимум одна машинно выполнимая `done_criteria`. Если сформулировать невозможно — шаг дробится дальше или помечается `MANUAL` |
| C5 | CONTEXT_FIT | `tokens(шаблон + контракт + context_pack + inputs) ≤ max_step_prompt_tokens` из executor_constraints; ожидаемый вывод `≤ max_output_tokens` |
| C6 | NO_IMPLICIT_KNOWLEDGE | Шаг не требует знаний вне контракта: сигнатуры, схемы, содержимое файлов, имена и версии инжектируются через `facts`/`inputs`/`context_pack` |
| C7 | OUTPUT_SIZE_FIT | Оценка нового кода `≤ max_new_lines_per_step` из executor_constraints |
| C8 | UNAMBIGUOUS_GOAL | Цель — один императив ≤ 25 слов с конкретным объектом (путь, имя, идентификатор). Запрещены глаголы-размытия («настроить», «улучшить», «оптимизировать», «подготовить», «доработать») без измеримого критерия |

## 10.3. Правила дробления

* **R1.** Нарушен любой критерий — шаг обязан быть разделён, пока все критерии не будут выполнены. Дробление рекурсивно.
* **R2.** Порядок дробления: по файлам → по сущностям (функция, класс, ключ конфигурации, миграция) → по блокам строк.
* **R3.** Если шаг неделим и при этом нарушает критерий — блокер `UNSPLITTABLE_STEP`, план в `PLAN_WITH_BLOCKERS`, вопрос пользователю.
* **R4.** Запрещено объединять мутирующие шаги в «пакеты» для экономии вызовов. Read-only проверки могут объединяться в `verification_batch` — `reference/protocol/execution.md` §4.1.
* **R5.** Тривиальная задача, сама удовлетворяющая критериям, дроблению не подлежит (§2.7).

Типовые приёмы дробления кодовых задач: сначала шаги скелета (сигнатуры, интерфейсы, заглушки), затем реализация каждой сущности отдельным шагом, затем шаги связывания; многофайловое изменение — по одному файлу на шаг, согласованность через артефакт-контракт (интерфейс, схема), зафиксированный до шагов реализации; большая функция — шаг «объявить сигнатуру», затем шаги «реализовать ветвь N».

## 10.4. Порождающие правила и покрытие эффектов

Для каждого ЛШ определяются наблюдаемые эффекты:

```yaml
effect:
  id: "EFF-001"
  type: "file_created"      # file_modified/service_restarted/package_installed/db_migrated/network_call/etc.
  resource:
    type: "file"
    path: "/etc/nginx/nginx.conf"
  expected_state:
    exists: true
  risk_tags: [PRIVILEGED, REVERSIBLE]
```

Каждый ЛШ порождает: один или несколько шагов; машинные `done_criteria` каждого шага; при необходимости интеграционные проверки задачи; rollback-инструкцию, если действие изменяет состояние; evidence-схему.

Минимальное покрытие: минимум одна проверка на каждый уникальный эффект; минимум одна проверка rollback-возможности для `REVERSIBLE` и выше; минимум одна проверка отсутствия утечки секретов для `SECRET_TOUCHING`; минимум одна проверка whitelist/denylist для `NETWORKED`.

## 10.5. Бюджет проверок и дедупликация

```yaml
coverage_budget_rules:
  base: "1 check per unique effect"
  max_checks_per_effect: 3
  duplicate_check_prevention: true
  risk_based_expansion: true
  max_total_checks_warning: "computed_from_complexity_or_config"
```

Две проверки считаются дубликатами, если совпадают: проверяемый эффект, ресурс, метод проверки, ожидаемый результат. Проверка сверх бюджета переносится в `optional_checks` с объяснением.

---

# 11. Контракт атомарного шага (краткое резюме)

Полная схема, форматы вывода и шаблон промпта — `reference/schemas/atomic_step.md`. Здесь — только нормативные требования ядра.

## 11.1. Обязательные поля контракта

`step_id`, `task_id`, `phase_id`, `status`, `origin`, `source_lsh`, `source_anchor`, `goal`, `action` (type + target), `knowledge_boundary` (facts / inputs / must_not_assume / on_missing_info), `context_pack`, `output_contract`, `done_criteria` (минимум 1), `negative_constraints` (для мутирующих действий), `risk_level`, `risk_tags`, `retry_policy`, `rollback`.

## 11.2. Граница знаний

Явное перечисление того, что исполнитель вправе считать истиной (`facts`), что ему предоставлено (`inputs`, `context_pack`) и что запрещено предполагать (`must_not_assume`). Всё вне границы знаний для исполнителя не существует. При нехватке данных — `STEP_BLOCKED`, не догадка (`on_missing_info: BLOCKED`).

## 11.3. Форматы вывода (нормативное соответствие)

Формат вывода не должен давать исполнителю канал мутации сверх разрешённого действием:

| action.type | output_contract.format |
|---|---|
| `CREATE_FILE` | `FULL_FILE` |
| `EDIT_FILE` | `UNIFIED_DIFF` + `unchanged_regions_hash` |
| `APPEND_FILE` | `APPEND_PAYLOAD` (оркестратор сам дописывает) |
| `DELETE_FILE` | `JSON_OBJECT` (подтверждение цели) |
| `WRITE_CONFIG_KEY` | `JSON_OBJECT` {key, value} |
| `RUN_COMMAND` | `COMMAND_OUTPUT` |
| `READ_FILE` | `JSON_OBJECT` |
| `ASSERT_STATE` | `JSON_OBJECT` |

Запрещённые сочетания: `APPEND_FILE` → `FULL_FILE`; `EDIT_FILE` → `FULL_FILE` без `unchanged_regions_hash`. Обоснование и обработка — `reference/schemas/atomic_step.md` §2.

## 11.4. Реестр артефактов

Исполнитель не имеет памяти между вызовами. Любой результат шага, необходимый последующим шагам, обязан быть опубликован как артефакт: именованный, версионируемый, неизменяемый, закреплённый SHA-256, с указанием производителя и потребителей.

Правила: зависимость N → M требует одновременно ребра в графе и артефакта в `inputs` шага M; артефакт неизменяем (новая версия — новый `artifact_id`); перед выдачей шага оркестратор материализует `inputs` и проверяет хеши (расхождение — событие дрейфа и пересборка шага); передача данных вне реестра запрещена. Схема — `reference/schemas/atomic_step.md` §4.

## 11.5. Шаблон промпта исполнителя

Фиксированные секции: РОЛЬ / ЗАДАЧА / ДЕЙСТВИЕ / ФАКТЫ / ВХОДНЫЕ ДАННЫЕ / КОНТЕКСТ / ФОРМАТ ОТВЕТА / ЗАПРЕТЫ / КРИТЕРИИ ГОТОВНОСТИ / ЕСЛИ НЕ ХВАТАЕТ ДАННЫХ. Состав и порядок секций менять запрещено. При повторной попытке добавляется секция `# ОШИБКА ПРЕДЫДУЩЕЙ ПОПЫТКИ` с дословным текстом непройденной проверки. Полный шаблон — `reference/schemas/atomic_step.md` §3.

## 11.6. Анти-галлюцинационные правила уровня плана

1. **Замкнутая вселенная** (§2.6).
2. **Дословный перенос.** Имена, пути, версии, сигнатуры и схемы копируются из исходного материала и артефактов без перефразирования.
3. **Неопределённости — до шагов.** Любая нехватка данных оформляется блокером или вопросом пользователю на этапе планирования, а не оставляется исполнителю.
4. **Только машинные критерии.** `done_criteria` не зависят от формулировок вывода: компиляция, тесты, grep по идентификаторам, хеши, exit code.
5. **Запреты по умолчанию.** Каждый мутирующий шаг содержит `negative_constraints`: запрет выхода за целевой файл, запрет новых зависимостей, запрет воспроизведения по памяти содержимого файлов вне `context_pack`.
6. **Контроль дрейфа.** Периодическая сверка состояния (протокол, п. 9).
7. **Двусторонняя трассируемость.** ЛШ ↔ шаг (§10.1).
8. **Запрет «полезных добавлений».** Всё, что выходит за рамки контракта, — отклонение, даже если результат выглядит улучшением.
9. **Воспроизводимость.** В evidence фиксируются провайдер, идентификатор модели (как вернула среда), `temperature`, `seed`. Рекомендуется `temperature ≤ 0.2`.
10. **Закрепление входов.** Артефакты инжектируются только по хешу; изменение хеша — пересборка шага, а не «свежая интерпретация».

---

# 12. Gate пригодности плана для исполнителя

Перед выдачей плана со статусом `FULL_PLAN` или `PARTIAL_PLAN` обязателен файл `executor_readiness.yaml` (схема — `reference/schemas/plan_artifacts.md` §8). Восемь проверок:

| ID | Проверка |
|---|---|
| R1 | Все шаги проходят критерии атомарности |
| R2 | Все шаги укладываются в контекстный бюджет |
| R3 | Каждый шаг имеет машинные done_criteria |
| R4 | Все зависимости материализованы артефактами |
| R5 | Ни один шаг не ссылается на контекст вне контракта |
| R6 | Шаблон промпта присутствует и валиден |
| R7 | Двустороннее покрытие ЛШ ↔ шаги полное |
| R8 | Нет неоднозначных глаголов в целях |

Провал любой проверки — `NOT_READY` с перечнем дефектов; план переводится в `PLAN_WITH_BLOCKERS`; дефекты устраняются до повторного прохождения gate. Gate выполняется для всех планов (атомарность обязательна всегда); при источнике ограничений `conservative_default` добавляется предупреждение `EXECUTOR_CONSTRAINTS_ASSUMED`. Gate не заменяет аудит §18: он проверяет пригодность плана для исполнителя, а не корректность логики.

---

# 13. Файловая структура результата

```text
Plan_<plan_name>/
  plan_hierarchy.yaml
  source_manifest.yaml
  skill_config.resolved.yaml
  environment_profile.resolved.yaml
  executor_profile.resolved.yaml
  artifacts_registry.yaml
  executor_readiness.yaml
  templates/
    atomic_step_prompt.md
  normalization/
    normalization_log.ndjson
    source_diff.yaml
  audit/
    audit_summary.yaml
    round_01.yaml
    ...
  Phase_01/
    phase_context.yaml
    phase_execution_log.ndjson
    phase_tests/
      test_01.yaml
    tasks/
      task_01.yaml
      task_02.yaml
    steps/
      step_0001.yaml
      step_0002.yaml
  Phase_02/
    ...
  final_report.yaml
```

Каждый файл `steps/step_NNNN.yaml` содержит ровно один контракт `atomic_step`. Все структурированные файлы — YAML или NDJSON. Свободный markdown допускается только для человекочитаемых пояснений, но не как единственный источник машинно-значимых данных.

Схемы всех файлов — `reference/schemas/plan_artifacts.md`.

---

# 14. Неделимые группы и ресурсные конфликты

## 14.1. Типы групп

```yaml
atomicity:
  enum:
    - INDEPENDENT                 # можно распараллеливать
    - ATOMIC                      # группа не разрывается
    - POTENTIALLY_ATOMIC          # не разрывается, параллелизм запрещён до подтверждения
    - POTENTIAL_RESOURCE_CONFLICT # последовательно по умолчанию
```

## 14.2. Источники atomicity

Аннотации `<!-- atomic_start --> ... <!-- atomic_end -->`; транзакции БД; временные файлы; lock-файлы; изменение одного ресурса; общий порт; общий сервис; секреты; production-impacting изменения.

## 14.3. Разрешение POTENTIAL_RESOURCE_CONFLICT

1. По умолчанию задачи ставятся в последовательное выполнение.
2. Причина конфликта фиксируется в `phase_context.yaml`.
3. В интерактивном режиме возможен запрос пользователя о распараллеливании:

```yaml
parallel_override:
  allowed: true
  confirmed_by_user: true
  confirmation_timestamp: "..."
```

4. В автономном режиме параллелизм для таких задач запрещён.
5. Для конфликтов `SECRET_TOUCHING`, `DESTRUCTIVE_IRREVERSIBLE`, `DATA_LOSS_RISK`, `PRODUCTION_IMPACTING` пользовательское разрешение на параллелизм не допускается без отдельной security override.

---

# 15. Стратегии повторов (резюме)

Единая иерархия retry и классификация ошибок `error_class` — нормативно определены в `reference/protocol/execution.md` §5. Ядро фиксирует только:

1. Иерархия лимитов: глобальный (`skill_config`) → задача (`retry_strategy.max_attempts`) → шаг (`retry_policy.max_attempts`). Переопределение только в сторону уменьшения.
2. Каждая задача обязана иметь `retry_strategy` (`none`/`fixed`/`linear`/`exponential_backoff`) с `retry_on` и `do_not_retry_on` по классам ошибок.
3. Step-retry применим только к ошибкам вывода/верификации исполнителя и никогда не отменяет `do_not_retry_on` задачи.
4. Ошибки `FORBIDDEN_COMMAND`, `UNSAFE_ACTION`, `PERMISSION_DENIED`, `VERIFICATION_LOGIC_FAILURE`, `ROLLBACK_UNAVAILABLE` не ретраятся автоматически.

---

# 16. Что план обязан передать оркестратору

Скилл не исполняет план. Runtime-протокол (роли, цикл фазы, протокол шага, retry/rollback-иерархии, дрейф-контроль) — `reference/protocol/execution.md`. Ядро фиксирует только контракт передачи:

1. `plan_hierarchy.yaml` — структура, порядок, статусы.
2. `environment_profile.resolved.yaml` — среда, политика команд, rollback среды.
3. `executor_profile.resolved.yaml` — ограничения исполнителя.
4. `executor_readiness.yaml` — результат gate: `READY`.
5. `artifacts_registry.yaml` — начальное состояние реестра (может быть пустым).
6. `templates/atomic_step_prompt.md` — шаблон промпта.
7. Для каждой фазы: `phase_context.yaml`, `tasks/task_NN.yaml`, `steps/step_NNNN.yaml`.

План без любого из этих элементов не считается сгенерированным.

---

# 17. Регенерация плана

Регенерация вызывается только при авторизованном пропуске задачи.

```yaml
regeneration_input:
  skipped_task_id: "task_03"
  skipped_lsh_ids: ["LSH-010"]
  completed_trace: ["LSH-001", "LSH-002"]
  current_state_ref: "phase_execution_log.ndjson"
  remaining_plan_ref: "plan_hierarchy.yaml"
```

Алгоритм:

1. Исключить пропущенный ЛШ.
2. Исключить все транзитивно зависимые ЛШ, если они не могут быть безопасно переоснованы.
3. Сохранить уже выполненные успешные элементы.
4. Перестроить частичный порядок оставшихся элементов.
5. Пересчитать риски, ресурсы, блокировки и бюджет проверок.
6. Пересоздать только хвост плана (включая повторную атомарную декомпозицию и gate).
7. Пометить исключённые задачи `status: SKIPPED`, `skip_reason: user_authorized_regeneration`.
8. Обновить `plan_hierarchy.yaml`.
9. Записать событие в журнал.

При исчерпании `max_regenerations_per_plan`: `PLAN_WITH_BLOCKERS`, `BLOCKED_REGENERATION_LIMIT_EXHAUSTED`, выполнение приостанавливается до ручного разрешения; автоматическое продолжение запрещено.

---

# 18. Аудит

## 18.1. Условия запуска

Аудит выполняется только для `FULL_PLAN` и `PARTIAL_PLAN` (для `PARTIAL_PLAN` — с пометкой `audit_scope_warning`). Пропускается для `PLAN_WITH_BLOCKERS`, `DRY_RUN_PLAN`, всех `REJECT_*` и `FATAL`; причина фиксируется в `audit_summary.yaml`.

## 18.2. Режим

Все аудит-агенты работают в режиме `REPORT_ONLY` и не имеют права изменять план, файлы или систему напрямую.

## 18.3. Состав

Базовые аудиторы: `logic_compliance` (соответствие исходной логике), `antifragility` (устойчивость к сбоям), `architecture` (архитектурная целостность). Ситуативные активируются тегами: `<!-- audit: security -->`, `<!-- audit: performance -->`, `<!-- audit: data-integrity -->`, `<!-- audit: network -->`, `<!-- audit: compliance -->`.

## 18.4. Раунды

Адаптивно: минимум 1, максимум 5; дополнительные раунды при HIGH/CRITICAL рисках, security/compliance тегах или после исправлений. Если пользователь требует ровно 5 — выполняется 5.

## 18.5. Классификация изъянов

```yaml
finding_severity:
  enum: [TRIVIAL, EASY, MEDIUM, HARD, CRITICAL]
```

## 18.6. Структура finding

```yaml
finding:
  id: "FND-001"
  round: 1
  auditor: "logic_compliance"
  severity: "MEDIUM"
  affected_phase: "Phase_01"
  affected_task: "task_02"
  affected_step: "AS-0003"
  description: "..."
  source_evidence_ref: "..."
  recommendation: "..."
  can_auto_fix: false
  requires_user_confirmation: true
```

## 18.7. Исправление

Исправления применяются только оркестратором. Локальные отклонения могут исправляться автоматически, если разрешено профилем среды и матрицей рисков; `CRITICAL` требует подтверждения пользователя; некорректность исходной логики не исправляется без изменения исходного `.md`; после исправления фазы возможен повторный аудит только затронутой фазы.

---

# 19. Статусы

```yaml
status:              # задачи и шаги
  enum: [pending, running, success, failed, skipped, blocked,
         blocked_requires_confirmation, blocked_forbidden_command,
         blocked_resource_conflict, blocked_regeneration_limit_exhausted, fatal]

phase_status:
  enum: [pending, running, success, partial, empty, blocked, failed, fatal]
```

---

# 20. Логирование

Все журналы — YAML или NDJSON. Свободный текст только в полях `message`, `description`, `notes`.

Обязательные поля любого события:

```yaml
event:
  timestamp: "2026-01-01T12:00:00Z"
  agent_id: "agent-id"
  action: "..."
  result: "success"          # success/failure/skipped/blocked/retry/fatal
  risk_level: "LOW"
  risk_tags: ["SAFE"]
  deviation:
    occurred: false
    description: null
```

Рекомендуемые дополнительные поля: `phase_id`, `task_id`, `step_id`, `command_hash`, `evidence_ref`, `duration_ms`, `attempt`, `error_class`, `resources_touched`.

Любое отклонение фиксируется:

```yaml
deviation:
  occurred: true
  category: "safety_override"
  description: "Command was not executed because it violated command policy."
  approved_by_user: false
  requires_audit: true
```

---

# 21. Финальный отчёт

Финальный отчёт создаётся всегда, кроме случаев полной невозможности записи файлов. Схема `final_report.yaml` — `reference/schemas/plan_artifacts.md` §7. Обязательно содержит: идентификаторы плана и источников, сводку выполнения (фазы/задачи/шаги, успехи/провалы/блокировки), блокеры, результаты аудита, сводку рисков, отклонения, итоговый результат.

---

# 22. Требования к качеству итогового плана

План считается качественным, если:

1. Каждый ЛШ имеет `source_anchor` и `origin`.
2. Каждая задача имеет `risk_level`, `risk_tags`, `retry_strategy`, `resources`, `isolation`.
3. Каждый шаг имеет полный контракт §11.1 и проходит все критерии атомарности §10.2.
4. Каждый шаг укладывается в контекстный бюджет executor_constraints.
5. Проверка каждого шага определена только его `done_criteria` — нет дублирующих источников истины.
6. Все команды валидируются через environment command policy.
7. Все проверки не дублируются без причины; бюджет проверок рассчитан и зафиксирован.
8. Все потенциальные ресурсные конфликты сериализованы или подтверждены пользователем.
9. Все `ASSUMPTION` и `LOW_CONFIDENCE_INFERENCE` элементы безопасно ограничены.
10. Все логи машинно-читаемы; все секреты редактируются до записи.
11. Регенерация имеет лимит и определённое поведение при его исчерпании.
12. Аудит запускается только при допустимом уровне деградации.
13. Финальный отчёт создаётся в любом завершённом или аварийном сценарии.
14. Все межшаговые зависимости материализованы артефактами реестра.
15. Двустороннее покрытие ЛШ ↔ шаги полное: нет сиротских шагов и непокрытых ЛШ.
16. Gate `executor_readiness.yaml` пройден с результатом `READY`.
17. Форматы вывода шагов соответствуют таблице §11.3 — нет каналов мутации сверх разрешённого действием.
18. executor_profile определён до генерации плана по процедуре §3.3; источник ограничений зафиксирован.

---

# 23. Запрещённые поведения

Скиллу запрещено:

* добавлять функциональные требования, которых нет в исходном материале;
* исполнять или планировать необратимые действия на основе предположений;
* использовать shell-строки без явного разрешения профиля;
* логировать секреты;
* игнорировать forbidden commands;
* распараллеливать потенциально конфликтующие задачи без правил;
* продолжать выполнение после исчерпания лимита регенераций;
* запускать аудит для `PLAN_WITH_BLOCKERS`, `DRY_RUN_PLAN`, `REJECT_*` или `FATAL`;
* создавать evidence в виде произвольного текста;
* скрывать неоднозначности;
* превращать `ASSUMPTION` в `EXPLICIT` без подтверждения пользователя;
* использовать markdown как единственный источник машинно-значимых данных;
* выдавать исполнителю шаг, не проходящий критерии атомарности или контекстный бюджет;
* объединять несколько мутирующих шагов в один вызов исполнителя;
* интерпретировать невалидный вывод исполнителя «по смыслу» сверх детерминированной нормализации;
* передавать данные между шагами вне реестра артефактов;
* оставлять неопределённости на усмотрение исполнителя вместо блокера;
* выдавать план при непройденном gate `executor_readiness`;
* продвигать шаги, зависимые от заблокированного шага;
* назначать пороги атомарности по имени, классу или размеру модели — только по измеримым ограничениям;
* вшивать в спецификацию списки моделей или провайдеров — перечисляется только обнаруженное в среде;
* использовать формат вывода, дающий канал мутации сверх разрешённого действием (§11.3);
* определять проверку шага вне его `done_criteria`.

---

# 24. Минимальный алгоритм работы скилла

```text
1. Загрузить source files.
2. Проверить UTF-8, непустоту, SHA-256.
3. Загрузить environment_profile.yaml.
4. Загрузить или создать skill_config.resolved.yaml.
4б. Определить ограничения исполнителя (§3.3, reference/protocol/executor_detection.md);
    материализовать executor_profile.resolved.yaml.
5. Классифицировать вход.
6. При необходимости запустить нормализатор.
7. Если нормализатор недоступен — применить fallback.
8. Извлечь ЛШ.
9. Проверить source anchors и origin.
10. Построить partial order.
11. Выявить циклы, блокеры, atomic groups и resource conflicts.
12. Определить эффекты.
13. Декомпозировать задачи в атомарные шаги (§10); сформировать контракты (§11)
    и реестр артефактов (§11.4).
14. Рассчитать coverage budget; дедуплицировать проверки.
15. Сгруппировать в фазы и задачи.
16. Проверить контекстные бюджеты всех шагов (критерий C5).
17. Присвоить risk_level и risk_tags.
18. Проверить команды по environment command policy.
19. Создать rollback/isolation правила (матрица областей — reference/protocol/execution.md §6).
20. Создать retry_strategy (иерархия — reference/protocol/execution.md §5).
21. Создать YAML/NDJSON файловую структуру (§13).
22. Проверить машинную валидность всех артефактов.
22а. Выполнить gate пригодности (§12); при провале — PLAN_WITH_BLOCKERS с перечнем дефектов.
23. Если план FULL/PARTIAL — разрешить аудит после выполнения.
24. Сформировать final_report.yaml.
```

---

# 25. Конец спецификации

Сгенерированный план должен быть:

* безопасным;
* трассируемым;
* машинно-читаемым;
* воспроизводимым;
* проверяемым;
* аудируемым;
* честным относительно исходного материала;
* устойчивым к неоднозначностям;
* ограниченным по рискам;
* атомарно декомпозированным для исполнения суб-агентами;
* модель-независимым — совместимым с любым исполнителем, чьи измеримые ограничения удовлетворяют контрактам шагов;
* пригодным для исполнения агентом без скрытых предположений.

## 26. Уроки для upstream-планов и hermetic-тестов

Подробный воспроизводимый checklist для Windows home-isolation, before/after manifest, artifact-path lint и dynamic placeholders: `references/upstream-hermetic-tests.md`.

При планировании вклада в upstream-репозиторий обязательно отделяй состояние локального checkout от состояния upstream:

1. До классификации падения выполнить `git fetch origin main --prune` и зафиксировать `origin/main` в `source_manifest`/evidence. Если локальная база отстаёт или upstream уже исправил симптом, не планировать исправление «по памяти».
2. Для воспроизведения использовать отдельный worktree от актуального `origin/main`; установленный checkout, пользовательские конфиги и активные внешние memory-backends не являются рабочей базой.
3. Разводить два диагностических контура: прямой запуск теста для локализации причины и canonical/CI-parity runner для проверки hermetic-окружения. Несовпадение результатов — отдельный эффект среды, а не доказательство flaky production-кода.
4. Для платформенных тестов проверять фактический источник поведения ОС, а не только POSIX-совместимый alias переменной. На Windows `pathlib.Path.home()` может использовать `USERPROFILE` или `HOMEDRIVE`+`HOMEPATH`, поэтому runner с `env -i` обязан явно сохранять необходимые non-secret system variables; подмена только `HOME` недостаточна.
5. Перед запуском тестов, которые могут обратиться к legacy-путям вроде `~/.hindsight`, снять hash-манифест реального пользовательского каталога и после прогона сравнить его. Не удалять и не «чинить» обнаруженные пользовательские файлы автоматически.
6. Если параллельный runner падает, а прямой запуск проходит, повторить без file-retry и несколькими clean-run итерациями. Retry не считать исправлением; в плане должен быть критерий отсутствия новых падений в canonical runner.
7. В финальном upstream-плане явно разделять: production-баг, test-isolation bug и runner/environment bug. Для разных классов предлагать разные PR либо останавливать реализацию при `cannot_reproduce`.
8. Перед выдачей плана выполнить runtime-side-effect review: baseline-прогоны не должны писать в реальные `~/.hermes`, `~/.hindsight`, workspace-конфиги или активные memory-backends. Сначала создать sandbox-home, направить туда `HOME` и платформенные home-переменные, явно убрать `HERMES_HOME`/конфиги, затем сделать before/after hash-манифест реальных пользовательских каталогов. Одного `path_policy` и отрицательного ограничения в контракте недостаточно.
9. Валидировать не только наличие артефактов, но и согласованность `artifact_id → registry.path → step input.ref → producer/consumer`. Любая рассинхронизация путей считается дефектом readiness-gate, даже если YAML синтаксически корректен.
10. Не оставлять в исполняемых командах незаполненные placeholders (`<owner>`, `<remote>`, `<id>`). Значение должно быть получено отдельным шагом и передано через материализованный артефакт; если это невозможно заранее, шаг обязан иметь явный `BLOCKED`/confirmation gate.
11. Если аудит плана отложен до исполнения, перед выдачей всё равно выполнить локальный structural/safety lint: YAML/NDJSON parsing, двустороннее LSH coverage, step IDs, artifact references, command policy, dynamic placeholders, protected-path invariants и отсутствие опасных baseline side effects. Результат не заменяет execution audit, но не позволяет выдать «READY» с уже известным дефектом.

## 27. Execution gates после генерации плана

1. **Drift gate действует до commit, а не только до первого теста.** После baseline и перед staging/commit повторно сверить `HEAD`, `origin/main` и рабочее дерево. Если upstream сдвинулся после тестов, сохранить uncommitted + untracked изменения в worktree-local stash/patch, rebase на свежую базу, затем повторить как минимум final targeted gate и все проверки, зависящие от baseline. Обновить `source_manifest`, baseline-artifact и их хеши; старые результаты нельзя выдавать за результаты финальной базы.
2. **Hermes Desktop Project — часть изоляции.** Для работы из desktop-сессии после создания execution-worktree переключить сессию в отдельный Project, anchored на этот worktree. Одного `terminal(workdir=...)` недостаточно как защиты от случайного действия в активном checkout.
3. **Staging gate должен быть точным.** Перед commit выполнить `git add` только разрешённых путей и проверить `git diff --cached --name-only` против exact allowlist. Не считать наличие tracked diff доказательством правильной области: untracked тесты и generated files проверяются отдельно.
4. **Git identity gate — до commit.** Проверить локальную author identity до запуска commit. Если identity отсутствует, оставить разрешённые файлы staged, не подставлять upstream author и не менять global git config без явного разрешения. Запросить у пользователя только `name/email`, затем выполнить commit и проверить clean status.
5. **Отделять test-pass от process-noise.** Stack trace в callback, encoding warning или platform permission failure не считать «зелёным» только из-за exit code 0. Зафиксировать их отдельно, классифицировать как pre-existing/environment blocker, проверить отсутствие связи с diff и не расширять PR без отдельного решения.
6. **Publication gate после commit обязателен.** Локальное выполнение плана и внешний push/PR — разные границы полномочий. Перед публикацией заново выполнить `git fetch origin main --prune`, проверить `HEAD..origin/main` и `origin/main..HEAD`; при новом upstream drift сделать worktree-local stash/rebase или rebase уже созданного commit, повторить финальный targeted gate и обновить commit/evidence. Разрешение «выполняй план» не отменяет отдельный gate, если план объявил push/PR требующими подтверждения.
7. **Не путать upstream remote с fork.** Перед push определить remote/owner через проверяемый GitHub/`gh`-артефакт. Если `origin` указывает на upstream-репозиторий, не отправлять ветку туда по умолчанию; сначала получить/создать пользовательский fork и remote с явным подтверждением. После push зафиксировать проверяемый branch URL/commit SHA, после создания PR — URL и номер; не объявлять публикацию успешной по одному exit code.

## 28. Автономное завершение upstream-вклада и CI fork-gate

1. Если пользователь явно подтвердил выполнение всего плана и отдельно попросил больше не задавать промежуточные вопросы, продолжать через уже объявленные безопасные gates самостоятельно. Не повторять confirmation-gates, которые пользователь уже явно покрыл; всё ещё блокировать действие при реально отсутствующей обязательной identity/credential или угрозе повреждения данных.
2. Перед публикацией проверить `gh auth status`, получить логин через `gh api user`, проверить наличие fork через `gh repo view <owner>/<repo>`. Если fork отсутствует, создать его через `gh repo fork <upstream>` и добавить отдельный remote (`fork`), сохранив `origin` как upstream.
3. Перед `gh pr create` проверить существующие PR по `head owner:branch`, чтобы не создавать дубль. После создания выполнить read-back через `gh pr view --json`: URL, base/head SHA, head owner, список изменённых файлов и тело PR должны соответствовать локальному evidence.
4. CI проверять в два этапа: `gh pr checks`/commit status и `gh run list --commit <sha>`. Различать `no checks reported`, `pending`, `failure`, `action_required` и отсутствие jobs. `action_required` с `jobs: []` — не CI failure и не CI success: это approval gate workflow для fork-PR.
5. Для fork-approval допустимо один раз проверить API approval endpoint, но HTTP 403 `Must have admin rights to Repository` фиксировать как внешний blocker. Не пытаться обходить его созданием фиктивных checks, повторным спамом rerun или изменением PR без причины. Добавить в PR comment точную ссылку на run, статус gate и локальные verification results; не объявлять CI завершённым успешно.
6. Если CI заблокирован правами upstream, локальный план всё равно можно завершить как `COMPLETED_WITH_EXTERNAL_CI_BLOCKED`: commit и PR handles проверены, все доступные локальные gates пройдены, AS для ожидания CI получает `blocked` с HTTP status/reason. Это предпочтительнее бесконечного polling или повторных вопросов пользователю.

*Конец скилла.*
