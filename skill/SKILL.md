---
name: laptev-plan
version: 4.0.0
license: MIT
description: >-
  Преобразует .md файлы с описанием задачи, процедуры или требований в
  формализованный, исполнимый, проверяемый и аудируемый план выполнения
  с машинно-читаемыми YAML/NDJSON-артефактами, моделью рисков и
  управляемой деградацией.
---

## СКИЛЛ ГЕНЕРАЦИИ ПЛАНА ВЫПОЛНЕНИЯ ЗАДАЧИ

**Версия 4.0 — универсальная спецификация с формальными контрактами, моделью рисков, бюджетом проверок, машинно-читаемыми логами и управляемой деградацией**

---

# 0. Назначение скилла

Данный скилл преобразует один или несколько `.md` файлов с описанием задачи, процедуры, требований или архитектурной логики в формализованный, исполнимый, проверяемый и аудируемый план выполнения.

Результатом работы является самодостаточная файловая структура `Plan_<plan_name>/`, содержащая:

* иерархию фаз, задач и чекпоинтов;
* машинно-читаемые YAML/NDJSON-артефакты;
* зависимости и частичный порядок выполнения;
* проверки эффектов и инвариантов;
* модель рисков;
* профиль среды исполнения;
* правила отката;
* стратегию повторов;
* журналы выполнения;
* evidence-модель;
* аудит и финальный отчёт.

Скилл не выполняет задачу сам по себе. Он генерирует план и инструкции для агента-исполнителя или оркестратора.

---

# 1. Термины и базовые сущности

## 1.1. Исходный материал

Исходный материал — один или несколько `.md` файлов либо директория с файлами, переданные пользователем.

Исходный материал является единственным источником функциональных требований. Скилл не имеет права добавлять новые функциональные требования от себя.

## 1.2. Логический шаг, ЛШ

Логический шаг (`LSH`) — минимальная смысловая инструкция, извлечённая из исходного материала или нормализованной структуры.

Пример:

```yaml
id: "LSH-001"
type: "EXEC"
body: "Установить пакет nginx"
origin: "EXPLICIT"
dependencies: []
```

## 1.3. Фаза

Фаза — логически завершённый крупный этап плана, содержащий одну или несколько задач.

Фазы выполняются последовательно, если частичный порядок не допускает иного. Пропуск фазы запрещён и ведёт к аварийному завершению выполнения с сохранением частичных результатов.

## 1.4. Задача

Задача — логически завершённая единица работы внутри фазы. Задача может включать одну или несколько атомарных исполняемых операций и связанных проверочных чекпоинтов.

## 1.5. Чекпоинт

Чекпоинт — элементарная исполняемая или проверочная операция внутри задачи.

Типы чекпоинтов:

* `AIO` — атомарная исполняемая операция;
* `VERIFY` — проверочная операция;
* `MANUAL` — ручная проверка, если автоматизация объективно невозможна.

## 1.6. Evidence

Evidence — машинно-читаемая запись фактического результата выполнения чекпоинта. Evidence не является свободным текстом. Оно должно иметь строгую структуру и позволять автоматическую проверку.

## 1.7. Частичный порядок

Частичный порядок — граф зависимостей между ЛШ, задачами или чекпоинтами. Эталоном выполнения является не одна жёсткая последовательность, а набор допустимых последовательностей, удовлетворяющих зависимостям.

---

# 2. Фундаментальные принципы

## 2.1. Незыблемость исходной логики

План является детерминированным развёртыванием исходной логики.

Допустимые контролируемые отклонения:

1. **Пропуск задачи пользователем**
   Приводит к регенерации оставшейся части плана, если лимит регенераций не исчерпан.

2. **Пропуск фазы**
   Запрещён. Если пользователь выбирает пропуск фазы, выполнение завершается аварийно с сохранением частичных результатов.

3. **Отклонение агента от плана**
   Допускается только при необходимости предотвращения вреда, нарушения безопасности или разрушения состояния. Любое отклонение фиксируется в логах и требует последующей верификации.

## 2.2. Прозрачность происхождения каждого элемента

Каждый ЛШ, задача, чекпоинт, проверка, аудит-вывод и инфраструктурный элемент должны иметь поле `origin`.

Допустимые значения:

```yaml
origin:
  enum:
    - EXPLICIT
    - INFERRED
    - SYSTEM
    - USER_CONFIRMED
    - ASSUMPTION
    - LOW_CONFIDENCE_INFERENCE
```

Значения:

* `EXPLICIT` — дословно извлечено из исходного материала.
* `INFERRED` — выведено анализатором из структуры, порядка, ссылок на ресурсы или контекста.
* `SYSTEM` — добавлено скиллом как инфраструктурный элемент: проверка, логирование, аудит, rollback, evidence.
* `USER_CONFIRMED` — подтверждено пользователем.
* `ASSUMPTION` — допущение с недостаточной уверенностью.
* `LOW_CONFIDENCE_INFERENCE` — слабый вывод, требующий осторожности.

Правила:

* `ASSUMPTION` и `LOW_CONFIDENCE_INFERENCE` не могут порождать `DESTRUCTIVE`, `DESTRUCTIVE_IRREVERSIBLE`, `PRIVILEGED`, `SECRET_TOUCHING` или `EXTERNAL_SIDE_EFFECT` действия без явного подтверждения пользователя.
* Любой элемент без `source_anchor` и без `origin: SYSTEM` считается недоверенным и не допускается к исполнению.
* Любое пользовательское подтверждение фиксируется как отдельное событие в журнале.

## 2.3. Универсальность с обязательной классификацией входа

Перед генерацией плана скилл классифицирует вход:

```yaml
input_class:
  enum:
    - EXECUTABLE_PROCEDURE
    - REQUIREMENTS_SPECIFICATION
    - ARCHITECTURE_DESCRIPTION
    - WEAKLY_STRUCTURED_TEXT
    - UNPARSABLE
    - NO_EXECUTABLE_LOGIC
    - CONTRADICTORY
    - UNSAFE
```

Поведение:

* `EXECUTABLE_PROCEDURE` → генерация плана напрямую.
* `REQUIREMENTS_SPECIFICATION` → выделение задач реализации, проверок и критериев завершения.
* `ARCHITECTURE_DESCRIPTION` → генерация плана анализа, валидации или реализации только при наличии исполняемых намерений.
* `WEAKLY_STRUCTURED_TEXT` → запуск нормализатора.
* `UNPARSABLE` → `REJECT_UNPARSABLE`.
* `NO_EXECUTABLE_LOGIC` → `REJECT_NO_EXECUTABLE_LOGIC`.
* `CONTRADICTORY` → запрос пользователя; если неразрешимо, `REJECT_CONTRADICTORY`.
* `UNSAFE` → `REJECT_UNSAFE`.

## 2.4. Нормализатор и режим недоверия

Если вход слабоструктурирован, скилл может использовать внешний LLM-нормализатор.

Нормализатору разрешено:

* структурировать исходный текст;
* выделять ЛШ;
* выделять зависимости;
* помечать неопределённости;
* помечать предположения;
* формировать промежуточный JSON/YAML.

Нормализатору запрещено:

* добавлять новые функциональные требования;
* заменять исходную логику;
* скрывать неоднозначности;
* превращать предположения в факты;
* создавать исполняемые действия без `source_anchor`.

Каждый результат нормализации обязан пройти self-diff against source.

Минимальные требования к self-diff:

```yaml
normalization_audit:
  source_fragment_id: "SRC-001"
  normalized_lsh_ids:
    - "LSH-001"
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
  low_confidence_items:
    - "LSH-004"
  confirmation_required: true
```

Если найден ЛШ без `source_anchor`, он автоматически получает `origin: ASSUMPTION` и не допускается к необратимым действиям.

## 2.5. Fallback при недоступности LLM-нормализатора

Если нормализатор недоступен, не отвечает, превышает таймаут или возвращает невалидный результат:

1. Если вход можно разобрать детерминированно без LLM — скилл продолжает работу в режиме `PARTIAL_PLAN` или `PLAN_WITH_BLOCKERS`, помечая все сомнительные элементы.
2. Если режим интерактивный — скилл запрашивает у пользователя упрощённое ручное структурирование в формате:

```yaml
steps:
  - id: "manual-1"
    text: "..."
    dependencies: []
    risk_hint: "SAFE"
```

3. Если пользователь не предоставляет структурирование или режим автономный — скилл возвращает `REJECT_UNPARSABLE` с пояснением:

```yaml
reject_reason:
  code: "NORMALIZER_UNAVAILABLE"
  message: "Вход слабоструктурирован, а нормализатор недоступен. Без нормализации невозможно безопасно извлечь исполняемую логику."
```

Скилл не должен выполнять или генерировать опасный план на основе неразобранного слабоструктурированного текста.

---

# 3. Входные параметры и конфигурация

## 3.1. Обязательные входные параметры

```yaml
required_inputs:
  source:
    type: "file_or_directory"
    allowed_extensions:
      - ".md"
  environment_profile:
    type: "capabilities_yaml"
```

## 3.2. Рекомендуемый конфигурационный файл

Пользователь может передать `skill_config.yaml`.

Если он не передан, используются значения по умолчанию.

```yaml
skill_config:
  schema_version: "1.0"
  plan_name: null
  execution_mode: "interactive" # interactive/autonomous/sandbox/production
  output_format: "yaml"
  log_format: "ndjson" # yaml/ndjson
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
    max_total_checks_warning_formula: "ceil(base_lsh_count * base_checks_per_lsh * avg_risk_multiplier * environment_multiplier * 4)"
    hard_max_total_checks: null
  audit:
    max_rounds: 5
    min_rounds: 1
    adaptive: true
```

## 3.3. Формула бюджета проверок

`max_total_checks_warning` не является магическим числом. Оно вычисляется как функция сложности:

```yaml
max_total_checks_warning:
  formula: >
    ceil(
      max(
        50,
        base_lsh_count
        * base_checks_per_lsh
        * avg_risk_multiplier
        * environment_multiplier
        * dependency_multiplier
        * 4
      )
    )
```

Где:

```yaml
complexity_metrics:
  base_lsh_count: "количество ЛШ"
  base_checks_per_lsh: "значение из skill_config, по умолчанию 1"
  avg_risk_multiplier: "среднее значение по risk_tags"
  environment_multiplier:
    single_environment: 1.0
    multiple_profiles: 1.0 + 0.25 * additional_profiles_count
  dependency_multiplier:
    low_dependency: 1.0
    medium_dependency: 1.25
    high_dependency: 1.5
```

Если пользователь явно задаёт `max_total_checks_warning` в конфигурации, это значение имеет приоритет над формулой.

Если вычисленный бюджет превышен:

* скилл не обязан аварийно завершаться;
* скилл фиксирует предупреждение;
* скилл применяет дедупликацию;
* скилл при необходимости понижает план до `PARTIAL_PLAN` с указанием усечённых проверок.

---

# 4. Уровни деградации

Допустимые уровни:

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
* `PLAN_WITH_BLOCKERS` — план содержит блокеры, требующие ручного решения.
* `DRY_RUN_PLAN` — только структура и анализ, без исполнения.
* `REJECT_UNSAFE` — отказ из-за риска вреда.
* `REJECT_UNPARSABLE` — невозможно разобрать вход.
* `REJECT_NO_EXECUTABLE_LOGIC` — нет исполняемой логики.
* `REJECT_CONTRADICTORY` — неразрешимые противоречия.
* `FATAL` — аварийное завершение во время исполнения или подготовки из-за нарушения безопасности, невозможности отката или исчерпания критического лимита.

Правила:

* `FATAL` применяется только при фактической невозможности продолжать безопасно.
* Для `PLAN_WITH_BLOCKERS` исполнение приостанавливается до ручного разрешения блокеров.
* `DRY_RUN_PLAN` никогда не должен содержать команды, предназначенные к автоматическому выполнению.

---

# 5. Модель рисков и политика безопасности

## 5.1. Многомерная модель риска

Операция может иметь несколько risk tags одновременно.

Запрещено использовать только одно поле `risk_level` для описания всей природы риска.

Структура:

```yaml
risk_level:
  enum:
    - LOW
    - MEDIUM
    - HIGH
    - CRITICAL

risk_tags:
  type: list
  allowed:
    - SAFE
    - REVERSIBLE
    - DESTRUCTIVE_REVERSIBLE_WITH_SNAPSHOT
    - DESTRUCTIVE_IRREVERSIBLE
    - DATA_LOSS_RISK
    - PRIVILEGED
    - SECRET_TOUCHING
    - NETWORKED
    - EXTERNAL_SIDE_EFFECT
    - COMPLIANCE_SENSITIVE
    - PRODUCTION_IMPACTING
```

Пояснения:

* `SAFE` — нет побочных эффектов.
* `REVERSIBLE` — изменения можно откатить штатным способом.
* `DESTRUCTIVE_REVERSIBLE_WITH_SNAPSHOT` — потенциально разрушительное действие, но есть проверенный snapshot/backup.
* `DESTRUCTIVE_IRREVERSIBLE` — необратимое действие.
* `DATA_LOSS_RISK` — риск потери данных.
* `PRIVILEGED` — требуются повышенные права.
* `SECRET_TOUCHING` — операция касается секретов, токенов, ключей или паролей.
* `NETWORKED` — операция использует сеть.
* `EXTERNAL_SIDE_EFFECT` — действие влияет на внешние системы, пользователей, платежи, письма, API, очереди, уведомления.
* `COMPLIANCE_SENSITIVE` — затрагивает регулируемые данные или процессы.
* `PRODUCTION_IMPACTING` — влияет на production-среду.

Если применимо несколько тегов, используется самый строгий режим из всех тегов.

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

Профиль среды обязан содержать поле:

```yaml
require_rollback_confirmation: true
```

Если `require_rollback_confirmation: true`, агент обязан запросить подтверждение пользователя перед откатом для операций с тегами:

* `REVERSIBLE`;
* `DESTRUCTIVE_REVERSIBLE_WITH_SNAPSHOT`;
* `DATA_LOSS_RISK`;
* `PRODUCTION_IMPACTING`.

Даже если матрица рисков допускает автоматический откат, это поле имеет приоритет.

В автономном режиме при необходимости подтверждения отката выполнение переводится в `PLAN_WITH_BLOCKERS`.

## 5.4. Секреты

Секретами считаются:

* API keys;
* tokens;
* passwords;
* private keys;
* session cookies;
* credentials;
* connection strings с паролями;
* OAuth secrets;
* любые значения, совпадающие с secret-patterns профиля среды.

Правила:

* Секреты не записываются в логи.
* stdout/stderr фильтруются до записи.
* Вместо значения секрета фиксируется маркер:

```yaml
redacted_secret:
  kind: "token"
  hash: "sha256:..."
  visible_prefix: "sk-..."
  redacted: true
```

---

# 6. Профиль среды исполнения

## 6.1. Обязательная схема environment_profile.yaml

```yaml
environment:
  schema_version: "1.0"
  name: "production"
  profile_type: "production" # local_dev/ci_pipeline/sandbox/production/production_readonly
  version: "1.0"
  scope: "full"
  execution_mode: "production" # interactive/autonomous/sandbox/production

  permissions:
    effective_user: "root"
    allowed_privilege_escalation: true
    requires_sudo_confirmation: true

  rollback:
    strategy: "snapshot" # snapshot/filesystem_backup/manual/none
    available: true
    verified: true
    require_rollback_confirmation: true
    create_command:
      argv: ["snapshotctl", "create", "--name", "{phase_id}"]
    restore_command:
      argv: ["snapshotctl", "restore", "--name", "{phase_id}"]
    validation_command:
      argv: ["snapshotctl", "status", "--name", "{phase_id}"]

  network_policy:
    mode: "restricted" # allow/restricted/deny
    whitelist:
      - "example.com"
      - "registry.npmjs.org"
    denylist: []
    allow_localhost: true

  secret_policy:
    mode: "mask" # mask/deny_output/strict_control
    patterns:
      - "(?i)api[_-]?key"
      - "(?i)token"
      - "(?i)password"
    allow_secret_read: false
    allow_secret_write: false

  timeout_policy:
    default_command_timeout_seconds: 300
    max_command_timeout_seconds: 1800
    manual_confirmation_timeout_seconds: 1800

  command_policy:
    default: "deny"
    shell_allowed: false
    executable_match_mode: "exact" # exact/path/prefix
    allow:
      - executable: "apt"
        match: "exact"
        allowed_args:
          mode: "prefix"
          prefixes:
            - ["update"]
            - ["install"]
        denied_args:
          patterns:
            - ".*--force-yes.*"
        requires_confirmation: true

      - executable: "systemctl"
        match: "exact"
        allowed_args:
          mode: "prefix"
          prefixes:
            - ["status"]
            - ["restart"]
        requires_confirmation: true

      - executable: "cp"
        match: "exact"
        allowed_args:
          mode: "pattern"
          patterns:
            - "^/tmp/.*"
        requires_confirmation: false

    deny:
      - executable: "rm"
        match: "exact"
      - executable: "mkfs"
        match: "exact"
      - executable: "dd"
        match: "exact"

    deny_patterns:
      - "rm\\s+-rf\\s+/"
      - "mkfs\\."
      - "dd\\s+if="
      - ":\\(\\)\\{.*:\\|:&.*\\}"

  path_policy:
    default: "deny_write"
    readable_paths:
      - "/tmp"
      - "/var/log"
    writable_paths:
      - "/tmp/project"
    protected_paths:
      - "/etc"
      - "/var/lib"
      - "/home"
      - "/root"

  validation:
    validation_command:
      argv: ["echo", "OK"]
    expected:
      exit_code: 0
      stdout_contains: "OK"
```

## 6.2. Правила проверки команд

Команды должны храниться в виде `argv`, а не свободной shell-строки.

Допустимо:

```yaml
command:
  argv: ["apt", "install", "nginx"]
```

Недопустимо без специального разрешения:

```yaml
command: "apt install nginx && rm -rf /tmp/x"
```

Правила:

1. Проверка `forbidden` выполняется до проверки `allowed`.
2. Запрещённая команда всегда имеет приоритет над разрешённой.
3. Исполняемый файл проверяется согласно `executable_match_mode`:

   * `exact` — полное совпадение имени исполняемого файла;
   * `path` — полное совпадение абсолютного пути;
   * `prefix` — разрешённый префикс пути, только если явно задан.
4. Аргументы проверяются отдельно через `allowed_args` и `denied_args`.
5. Shell-выполнение запрещено, если `shell_allowed: false`.
6. Если shell необходим, команда автоматически получает risk tags:

   * `PRIVILEGED`, если есть sudo/root;
   * `DESTRUCTIVE_REVERSIBLE_WITH_SNAPSHOT` или выше, если есть изменения состояния;
   * `SECRET_TOUCHING`, если есть переменные или файлы с секретами.
7. Команда без успешной валидации переводит задачу в `BLOCKED`.

---

# 7. Загрузка, валидация и классификация исходных данных

## 7.1. Загрузка файлов

Скилл обязан:

1. Прочитать все `.md` файлы в UTF-8.
2. Проверить существование и непустоту.
3. Вычислить SHA-256 каждого файла.
4. Вычислить общую контрольную сумму.
5. Сохранить список файлов в `plan_hierarchy.yaml`.

Пример:

```yaml
source_files:
  - path: "install.md"
    sha256: "..."
    non_empty_lines: 128
combined_sha256: "..."
```

## 7.2. Определение имени плана

```yaml
plan_name:
  priority:
    - explicit_user_parameter
    - skill_config.plan_name
    - sanitized_first_file_name
    - combined_sha256_short
```

Корневая папка:

```text
Plan_<plan_name>/
```

## 7.3. Классификация

Классификатор обязан вернуть:

```yaml
classification:
  input_class: "EXECUTABLE_PROCEDURE"
  confidence: 0.91
  reasons:
    - "Содержит последовательные инструкции"
    - "Есть команды и ожидаемые результаты"
  requires_normalization: false
```

Если confidence ниже `0.7`, вход считается слабоструктурированным и требует нормализации или пользовательского подтверждения.

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
  risk_tags:
    - PRIVILEGED
    - NETWORKED
    - REVERSIBLE
```

## 8.2. Типы ЛШ

```yaml
lsh_type:
  enum:
    - EXEC
    - CONFIG
    - ANALYZE
    - REFACTOR
    - CONDITION
    - LOOP
    - WAIT
    - INPUT
    - ASSERT
    - TEST
    - DOCUMENT
    - MIGRATE
    - CLEANUP
    - ROLLBACK
```

## 8.3. Построение графа зависимостей

Зависимости определяются по:

* явному порядку в исходном тексте;
* ссылкам на файлы;
* изменяемым ресурсам;
* переменным;
* результатам предыдущих шагов;
* транзакционным группам;
* пользовательским аннотациям;
* рискам конфликтов.

Результат:

```yaml
partial_order:
  nodes:
    - "LSH-001"
    - "LSH-002"
  edges:
    - from: "LSH-001"
      to: "LSH-002"
      reason: "LSH-002 использует пакет, установленный в LSH-001"
```

Циклы:

* если цикл является допустимым `LOOP`, он разворачивается согласно правилам циклов;
* если цикл является противоречием, скилл запрашивает уточнение;
* если уточнение невозможно, план получает `PLAN_WITH_BLOCKERS` или `REJECT_CONTRADICTORY`.

---

# 9. Обработка циклов

Для каждого `LOOP` требуется конечная граница.

Источники границы по приоритету:

1. Явная аннотация:

```markdown
<!-- max_iterations: 10 -->
```

2. Известный конечный список.
3. Числовой диапазон.
4. Пользовательское подтверждение.
5. Блокер.

Если граница не определена:

```yaml
blocker:
  code: "UNBOUNDED_LOOP"
  lsh_id: "LSH-010"
  message: "Цикл не имеет конечной границы. Требуется указать max_iterations."
```

План переводится в `PLAN_WITH_BLOCKERS`.

---

# 10. Атомарная декомпозиция и покрытие эффектов

## 10.1. Эффекты

Для каждого ЛШ определяются наблюдаемые эффекты:

```yaml
effect:
  id: "EFF-001"
  type: "file_created" # file_modified/service_restarted/package_installed/db_migrated/network_call/etc.
  resource:
    type: "file"
    path: "/etc/nginx/nginx.conf"
  expected_state:
    exists: true
  risk_tags:
    - PRIVILEGED
    - REVERSIBLE
```

## 10.2. Порождающие правила

Каждый ЛШ порождает:

* одну или несколько `AIO`;
* одну или несколько `VERIFY`;
* при необходимости `MANUAL`;
* rollback-инструкцию, если действие изменяет состояние;
* evidence-схему.

Минимальное покрытие:

* минимум одна проверка на каждый уникальный эффект;
* минимум одна проверка rollback-возможности для `REVERSIBLE` и выше;
* минимум одна проверка отсутствия утечки секретов для `SECRET_TOUCHING`;
* минимум одна проверка whitelist/denylist для `NETWORKED`.

## 10.3. Бюджет проверок

Правила:

```yaml
coverage_budget_rules:
  base: "1 check per unique effect"
  max_checks_per_effect: 3
  duplicate_check_prevention: true
  risk_based_expansion: true
  max_total_checks_warning: "computed_from_complexity_or_config"
```

Дедупликация:

Две проверки считаются дубликатами, если совпадают:

* проверяемый эффект;
* ресурс;
* метод проверки;
* ожидаемый результат.

Если проверка превышает бюджет, она может быть перенесена в `optional_checks` с объяснением.

---

# 11. Группировка в фазы, задачи и чекпоинты

## 11.1. Иерархия

```text
Фаза → Задача → Чекпоинты
```

## 11.2. Фаза

Фаза формируется по логическим границам:

* подготовка;
* установка;
* конфигурация;
* миграция;
* тестирование;
* валидация;
* аудит;
* cleanup.

Размер фаз адаптивный. Жёстких числовых минимумов нет.

## 11.3. Задача

Задача должна быть:

* логически завершённой;
* откатываемой или явно помеченной как неоткатываемая;
* проверяемой;
* привязанной к ЛШ;
* снабжённой retry strategy;
* снабжённой risk model;
* снабжённой ресурсами.

## 11.4. Чекпоинт

Чекпоинт должен быть элементарным.

У чекпоинта должны быть:

* `checkpoint_id`;
* `type`;
* `origin`;
* `risk_level`;
* `risk_tags`;
* `command` или `manual_instruction`;
* `expected`;
* `evidence`;
* `status`.

---

# 12. Неделимые группы и ресурсные конфликты

## 12.1. Типы групп

```yaml
atomicity:
  enum:
    - INDEPENDENT
    - ATOMIC
    - POTENTIALLY_ATOMIC
    - POTENTIAL_RESOURCE_CONFLICT
```

Правила:

* `ATOMIC` — группа не разрывается.
* `POTENTIALLY_ATOMIC` — группа не разрывается, параллелизм запрещён до подтверждения.
* `POTENTIAL_RESOURCE_CONFLICT` — задачи выполняются последовательно по умолчанию.
* `INDEPENDENT` — можно распараллеливать при отсутствии иных ограничений.

## 12.2. Источники atomicity

* аннотации:

```markdown
<!-- atomic_start -->
...
<!-- atomic_end -->
```

* транзакции БД;
* временные файлы;
* lock-файлы;
* изменение одного ресурса;
* общий порт;
* общий сервис;
* секреты;
* production-impacting изменения.

## 12.3. Алгоритм разрешения POTENTIAL_RESOURCE_CONFLICT

Если две или более задачи помечены как `POTENTIAL_RESOURCE_CONFLICT`:

1. По умолчанию они ставятся в последовательное выполнение.
2. Агент фиксирует причину конфликта в `phase_context.yaml`.
3. В интерактивном режиме агент может запросить у пользователя подтверждение, можно ли их распараллелить.
4. Если пользователь подтверждает, задачи получают:

```yaml
parallel_override:
  allowed: true
  confirmed_by_user: true
  confirmation_timestamp: "..."
```

5. В автономном режиме параллелизм для таких задач запрещён.
6. Если конфликт касается `SECRET_TOUCHING`, `DESTRUCTIVE_IRREVERSIBLE`, `DATA_LOSS_RISK` или `PRODUCTION_IMPACTING`, пользовательское разрешение на параллелизм не допускается без отдельной security override.

---

# 13. Файловая структура результата

```text
Plan_<plan_name>/
  plan_hierarchy.yaml
  source_manifest.yaml
  skill_config.resolved.yaml
  environment_profile.resolved.yaml
  normalization/
    normalization_log.ndjson
    source_diff.yaml
  audit/
    audit_summary.yaml
    round_01.yaml
    round_02.yaml
    ...
  Phase_01/
    phase_context.yaml
    phase_execution_log.ndjson
    phase_tests/
      test_01.yaml
    tasks/
      task_01.yaml
      task_02.yaml
  Phase_02/
    ...
  final_report.yaml
```

Все структурированные файлы должны быть YAML или NDJSON.

Свободный markdown допускается только для человекочитаемых пояснений, но не как единственный источник машинно-значимых данных.

---

# 14. Схемы артефактов

## 14.1. plan_hierarchy.yaml

```yaml
schema_version: "1.0"
plan_id: "PLAN-..."
plan_name: "..."
created_at: "2026-01-01T12:00:00Z"
degradation_level: "FULL_PLAN"

source:
  files:
    - path: "input.md"
      sha256: "..."
      non_empty_lines: 123
  combined_sha256: "..."

environment_profile_ref: "environment_profile.resolved.yaml"
skill_config_ref: "skill_config.resolved.yaml"

complexity:
  lsh_count: 42
  effect_count: 80
  dependency_density: "medium"
  avg_risk_multiplier: 1.4
  max_total_checks_warning: 420

phases:
  - phase_id: "Phase_01"
    path: "Phase_01/phase_context.yaml"
    status: "pending"
    tasks:
      - "task_01"
      - "task_02"

global_partial_order:
  nodes:
    - "Phase_01"
    - "Phase_02"
  edges:
    - from: "Phase_01"
      to: "Phase_02"
      reason: "Phase_02 depends on installed components"
```

## 14.2. phase_context.yaml

```yaml
schema_version: "1.0"
phase_id: "Phase_01"
status: "pending"

goal: "Install and validate required packages."

input_state:
  expected:
    - "System is reachable"
    - "Rollback snapshot is available"

completion_criteria:
  - "All tasks completed"
  - "All required checkpoints passed"
  - "No unresolved HIGH/CRITICAL findings"

tasks:
  - task_id: "task_01"
    path: "tasks/task_01.yaml"
  - task_id: "task_02"
    path: "tasks/task_02.yaml"

local_partial_order:
  nodes:
    - "task_01"
    - "task_02"
  edges:
    - from: "task_01"
      to: "task_02"
      reason: "Configuration requires package installation"

resource_locks:
  - resource_id: "file:/etc/nginx/nginx.conf"
    tasks:
      - "task_02"
    lock_type: "exclusive"

parallelism:
  max_parallel_tasks: 2
  groups:
    - group_id: "parallel_group_01"
      tasks:
        - "task_03"
        - "task_04"
      allowed: true
      reason: "No shared resources"

rollback:
  strategy: "snapshot"
  require_confirmation: true
```

## 14.3. task_NN.yaml

```yaml
schema_version: "1.0"

task_id: "task_01"
phase_id: "Phase_01"
status: "pending"

origin: "EXPLICIT"
source_lsh:
  - "LSH-001"

description: "Install nginx package."

risk_level: "HIGH"
risk_tags:
  - PRIVILEGED
  - NETWORKED
  - REVERSIBLE

atomicity: "INDEPENDENT"

resources:
  - resource_id: "package:nginx"
    type: "package"
    name: "nginx"
    access: "write"

isolation:
  rollback_strategy: "snapshot"
  rollback_available: true
  rollback_verified: true
  require_rollback_confirmation: true

retry_strategy:
  type: "exponential_backoff" # none/fixed/linear/exponential_backoff
  max_attempts: 10
  initial_delay_seconds: 5
  max_delay_seconds: 120
  multiplier: 2
  retry_on:
    - "nonzero_exit"
    - "timeout"
    - "transient_network_error"
  do_not_retry_on:
    - "permission_denied"
    - "forbidden_command"
    - "unsafe_operation"

checkpoints:
  - checkpoint_id: "CP_001"
    type: "AIO"
    origin: "EXPLICIT"
    source_anchor:
      file: "input.md"
      line_start: 12
      line_end: 12
      quote_hash: "sha256:..."
    risk_level: "HIGH"
    risk_tags:
      - PRIVILEGED
      - NETWORKED
      - REVERSIBLE
    command:
      argv:
        - "apt"
        - "install"
        - "nginx"
      shell: false
      timeout_seconds: 300
    expected:
      exit_code: 0
      stdout_contains: []
      stderr_not_contains:
        - "error"
    evidence:
      status: "not_collected"

  - checkpoint_id: "CP_002"
    type: "VERIFY"
    check_type: "READONLY"
    origin: "SYSTEM"
    risk_level: "LOW"
    risk_tags:
      - SAFE
    command:
      argv:
        - "nginx"
        - "-v"
      shell: false
      timeout_seconds: 60
    expected:
      exit_code: 0
    evidence:
      status: "not_collected"
```

## 14.4. Структура evidence

Evidence обязано быть вложенным YAML-объектом.

```yaml
evidence:
  status: "collected" # not_collected/collected/failed/redacted/skipped
  collected_at: "2026-01-01T12:00:00Z"
  agent_id: "agent-task-01"
  checkpoint_id: "CP_001"
  attempt: 1

  command:
    argv:
      - "apt"
      - "install"
      - "nginx"
    shell: false
    command_hash: "sha256:..."

  result:
    exit_code: 0
    duration_ms: 12345
    timed_out: false

  output:
    stdout_ref: "logs/artifacts/CP_001_stdout.txt"
    stderr_ref: "logs/artifacts/CP_001_stderr.txt"
    stdout_sha256: "..."
    stderr_sha256: "..."
    stdout_redacted: true
    stderr_redacted: true

  changed_resources:
    - resource_id: "package:nginx"
      type: "package"
      before:
        present: false
      after:
        present: true
        version: "1.24.0"
      verification_method: "package_manager_query"

  file_hashes:
    - path: "/etc/nginx/nginx.conf"
      before_sha256: "..."
      after_sha256: "..."

  assertions:
    - assertion: "exit_code == 0"
      passed: true
    - assertion: "stderr does not contain forbidden patterns"
      passed: true

  redactions:
    - kind: "secret"
      pattern_id: "token"
      occurrences: 1

  verifier:
    verifier_id: "agent-task-01"
    verification_time: "2026-01-01T12:00:02Z"

  deviation:
    occurred: false
    description: null
```

Evidence не должно быть произвольной строкой.

## 14.5. phase_execution_log.ndjson

Каждая строка — отдельное событие.

Обязательные поля:

```yaml
log_event:
  timestamp: "2026-01-01T12:00:00Z"
  agent_id: "agent-phase-01"
  phase_id: "Phase_01"
  task_id: "task_01"
  checkpoint_id: "CP_001"
  action: "execute_command"
  result: "success" # success/failure/skipped/blocked/retry/fatal
  risk_level: "HIGH"
  risk_tags:
    - PRIVILEGED
    - NETWORKED
  deviation:
    occurred: false
    description: null
  message: "Command executed successfully"
  evidence_ref: "tasks/task_01.yaml#/checkpoints/0/evidence"
```

Все журналы должны быть машинно-читаемыми: YAML или NDJSON.

---

# 15. Стратегии повторов

Каждая задача обязана иметь `retry_strategy`.

Допустимые стратегии:

```yaml
retry_strategy_type:
  enum:
    - none
    - fixed
    - linear
    - exponential_backoff
```

## 15.1. none

```yaml
retry_strategy:
  type: "none"
  max_attempts: 1
```

## 15.2. fixed

```yaml
retry_strategy:
  type: "fixed"
  max_attempts: 5
  delay_seconds: 10
```

## 15.3. linear

```yaml
retry_strategy:
  type: "linear"
  max_attempts: 5
  initial_delay_seconds: 5
  increment_seconds: 5
```

## 15.4. exponential_backoff

```yaml
retry_strategy:
  type: "exponential_backoff"
  max_attempts: 10
  initial_delay_seconds: 5
  multiplier: 2
  max_delay_seconds: 120
```

Правила:

* `max_attempts` не может превышать глобальный лимит `skill_config.max_task_attempts`.
* При 5-й последовательной неудаче в интерактивном режиме запрашивается пользователь.
* В автономном режиме при 5-й неудаче задача переводится в `BLOCKED`, если ошибка требует решения пользователя.
* Ошибки `forbidden_command`, `unsafe_operation`, `secret_leak_detected`, `rollback_unavailable` не ретраятся автоматически.

---

# 16. Инструкции исполнения для агента-исполнителя

## 16.1. Роли

### Оркестратор

Оркестратор:

1. Читает `plan_hierarchy.yaml`.
2. Проверяет `environment_profile.resolved.yaml`.
3. Проверяет совместимость плана со средой.
4. Запускает фазы в допустимом порядке.
5. Обрабатывает деградацию, блокеры, регенерации и аудит.
6. Формирует финальный отчёт.

### Агент фазы

Агент фазы:

1. Читает `phase_context.yaml`.
2. Проверяет rollback-состояние.
3. Планирует задачи с учётом ресурсных блокировок.
4. Запускает агентов задач.
5. Собирает evidence.
6. Проверяет локальный частичный порядок.
7. Запускает фазовые тесты.

### Агент задачи

Агент задачи:

1. Читает `task_NN.yaml`.
2. Валидирует команды по профилю среды.
3. Выполняет чекпоинты по порядку.
4. Собирает evidence.
5. Применяет retry strategy.
6. Выполняет rollback при необходимости и разрешении.
7. Обновляет статус задачи.

## 16.2. Цикл выполнения фазы

```text
Для каждой фазы:
    если фаза пуста:
        status = EMPTY
        перейти к следующей фазе

    attempts = 0

    пока attempts < max_phase_attempts:
        attempts += 1

        проверить rollback_available
        если rollback требуется и require_rollback_confirmation:
            запросить подтверждение
            если подтверждение недоступно:
                degradation_level = PLAN_WITH_BLOCKERS
                приостановить выполнение

        восстановить состояние до фазы

        построить расписание задач:
            - конфликтующие ресурсы последовательно
            - POTENTIAL_RESOURCE_CONFLICT последовательно
            - POTENTIALLY_ATOMIC без параллелизма
            - независимые задачи можно параллелить до max_parallel_tasks

        выполнить задачи

        если пользователь пропустил задачу:
            если regeneration_count < max_regenerations_per_plan:
                немедленно регенерировать хвост плана
                regeneration_count += 1
                продолжить с обновлённой структурой
            иначе:
                degradation_level = PLAN_WITH_BLOCKERS
                status = BLOCKED_REGENERATION_LIMIT_EXHAUSTED
                приостановить выполнение до ручного разрешения

        проверить частичный порядок

        если выверка не прошла:
            если attempts == 5:
                запросить пользователя
            продолжить

        выполнить интеграционные тесты

        если тесты успешны:
            status = success
            перейти к следующей фазе

    если attempts >= max_phase_attempts:
        status = FATAL
        сохранить частичные результаты
        остановить выполнение
```

## 16.3. Поведение при исчерпании лимита регенераций

Если `max_regenerations_per_plan` исчерпан:

```yaml
regeneration_limit_exhausted:
  degradation_level: "PLAN_WITH_BLOCKERS"
  current_phase_status: "BLOCKED_REGENERATION_LIMIT_EXHAUSTED"
  execution: "suspended"
  required_action: "manual_resolution"
```

Правила:

* текущая фаза не считается успешно завершённой;
* дальнейшее выполнение приостанавливается;
* финальный отчёт обязан указать пропущенную задачу, зависимые исключённые элементы и причину остановки;
* автоматическое продолжение запрещено до ручного решения.

---

# 17. Регенерация плана

Регенерация вызывается только при авторизованном пропуске задачи.

Вход регенерации:

```yaml
regeneration_input:
  skipped_task_id: "task_03"
  skipped_lsh_ids:
    - "LSH-010"
  completed_trace:
    - "LSH-001"
    - "LSH-002"
  current_state_ref: "phase_execution_log.ndjson"
  remaining_plan_ref: "plan_hierarchy.yaml"
```

Алгоритм:

1. Исключить пропущенный ЛШ.
2. Исключить все транзитивно зависимые ЛШ, если они не могут быть безопасно переоснованы.
3. Сохранить уже выполненные успешные элементы.
4. Перестроить частичный порядок оставшихся элементов.
5. Пересчитать риски, ресурсы, блокировки и бюджет проверок.
6. Пересоздать только хвост плана.
7. Пометить исключённые задачи:

```yaml
status: "SKIPPED"
skip_reason: "user_authorized_regeneration"
```

8. Обновить `plan_hierarchy.yaml`.
9. Записать событие в журнал.

---

# 18. Аудит

## 18.1. Условия запуска аудита

Аудит выполняется только для планов с уровнем:

* `FULL_PLAN`;
* `PARTIAL_PLAN`.

Для `PARTIAL_PLAN` аудит выполняется с пометкой:

```yaml
audit_scope_warning: "Audit results may be incomplete because the plan is partial."
```

Аудит пропускается для:

* `PLAN_WITH_BLOCKERS`;
* `DRY_RUN_PLAN`;
* `REJECT_UNSAFE`;
* `REJECT_UNPARSABLE`;
* `REJECT_NO_EXECUTABLE_LOGIC`;
* `REJECT_CONTRADICTORY`;
* `FATAL`.

Причина пропуска фиксируется в `audit_summary.yaml`.

## 18.2. Режим аудита

Все аудит-агенты работают в режиме `REPORT_ONLY`.

Аудиторы не имеют права изменять план, файлы или систему напрямую.

## 18.3. Состав аудиторов

Базовые аудиторы:

* `logic_compliance` — соответствие исходной логике;
* `antifragility` — устойчивость к сбоям;
* `architecture` — архитектурная целостность.

Ситуативные аудиторы активируются тегами:

```markdown
<!-- audit: security -->
<!-- audit: performance -->
<!-- audit: data-integrity -->
<!-- audit: network -->
<!-- audit: compliance -->
```

## 18.4. Количество раундов аудита

По умолчанию аудит адаптивный:

* минимум 1 раунд;
* максимум 5 раундов;
* дополнительные раунды запускаются при наличии HIGH/CRITICAL рисков, security/compliance тегов или после исправлений.

Если пользователь требует ровно 5 раундов, выполняются 5 раундов.

## 18.5. Классификация изъянов

```yaml
finding_severity:
  enum:
    - TRIVIAL
    - EASY
    - MEDIUM
    - HARD
    - CRITICAL
```

`EASY+` означает всё, кроме `TRIVIAL`.

## 18.6. Структура audit finding

```yaml
finding:
  id: "FND-001"
  round: 1
  auditor: "logic_compliance"
  severity: "MEDIUM"
  affected_phase: "Phase_01"
  affected_task: "task_02"
  affected_checkpoint: "CP_003"
  description: "..."
  source_evidence_ref: "..."
  recommendation: "..."
  can_auto_fix: false
  requires_user_confirmation: true
```

## 18.7. Исправление изъянов

Исправления применяются только оркестратором.

Правила:

* локальные отклонения от плана могут быть исправлены автоматически, если это разрешено профилем среды и матрицей рисков;
* `CRITICAL` требует подтверждения пользователя;
* некорректность исходной логики не исправляется без изменения исходного `.md`;
* после исправления фазы возможен повторный аудит только затронутой фазы.

---

# 19. Статусы

## 19.1. Статусы задач и чекпоинтов

```yaml
status:
  enum:
    - pending
    - running
    - success
    - failed
    - skipped
    - blocked
    - blocked_requires_confirmation
    - blocked_forbidden_command
    - blocked_resource_conflict
    - blocked_regeneration_limit_exhausted
    - fatal
```

## 19.2. Статусы фаз

```yaml
phase_status:
  enum:
    - pending
    - running
    - success
    - partial
    - empty
    - blocked
    - failed
    - fatal
```

---

# 20. Логирование

Все журналы ведутся в структурированном виде: YAML или NDJSON.

Свободный текст допускается только в полях `message`, `description`, `notes`.

## 20.1. Обязательные поля любого события

```yaml
event:
  timestamp: "2026-01-01T12:00:00Z"
  agent_id: "agent-id"
  action: "..."
  result: "success"
  risk_level: "LOW"
  risk_tags:
    - SAFE
  deviation:
    occurred: false
    description: null
```

## 20.2. Дополнительные рекомендуемые поля

```yaml
event:
  phase_id: "Phase_01"
  task_id: "task_01"
  checkpoint_id: "CP_001"
  command_hash: "sha256:..."
  evidence_ref: "..."
  duration_ms: 1234
  attempt: 1
  retry_strategy: "exponential_backoff"
  resources_touched:
    - "file:/tmp/example"
```

## 20.3. Deviations

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

Финальный отчёт создаётся всегда, кроме случаев полной невозможности записи файлов.

`final_report.yaml` содержит:

```yaml
final_report:
  schema_version: "1.0"
  plan_id: "PLAN-..."
  plan_name: "..."
  created_at: "..."
  completed_at: "..."
  degradation_level: "FULL_PLAN"

  source:
    combined_sha256: "..."
    files:
      - path: "input.md"
        sha256: "..."

  execution_summary:
    phase_count: 3
    task_count: 12
    checkpoint_count: 48
    successful_tasks: 11
    failed_tasks: 1
    skipped_tasks: 0
    blocked_tasks: 1
    regenerations: 1
    user_confirmations: 2

  blockers:
    - id: "BLK-001"
      reason: "UNBOUNDED_LOOP"
      affected_lsh: "LSH-010"

  audit:
    performed: true
    scope_warning: null
    findings_count:
      trivial: 2
      easy: 1
      medium: 0
      hard: 0
      critical: 0

  risk_summary:
    highest_risk_level: "HIGH"
    risk_tags_seen:
      - PRIVILEGED
      - NETWORKED

  deviations:
    - event_ref: "phase_execution_log.ndjson:42"
      category: "forbidden_command_blocked"

  result: "completed_with_warnings"
```

---

# 22. Требования к качеству итогового плана

План считается качественным, если:

1. Каждый ЛШ имеет `source_anchor`.
2. Каждый ЛШ имеет `origin`.
3. Каждый task имеет `risk_level`, `risk_tags`, `retry_strategy`, `resources`, `isolation`.
4. Каждый checkpoint имеет `expected` и `evidence`.
5. Все команды валидируются через environment command policy.
6. Все проверки не дублируются без причины.
7. Бюджет проверок рассчитан и зафиксирован.
8. Все потенциальные ресурсные конфликты либо сериализованы, либо подтверждены пользователем.
9. Все `ASSUMPTION` и `LOW_CONFIDENCE_INFERENCE` элементы безопасно ограничены.
10. Все логи машинно-читаемы.
11. Все секреты редактируются до записи.
12. Регенерация имеет лимит и определённое поведение при его исчерпании.
13. Аудит запускается только при допустимом уровне деградации.
14. Финальный отчёт создаётся в любом завершённом или аварийном сценарии.

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
* превращать `ASSUMPTION` в `EXPLICIT` без пользовательского подтверждения;
* использовать markdown как единственный источник машинно-значимых данных.

---

# 24. Минимальный алгоритм работы скилла

```text
1. Загрузить source files.
2. Проверить UTF-8, непустоту, SHA-256.
3. Загрузить environment_profile.yaml.
4. Загрузить или создать skill_config.resolved.yaml.
5. Классифицировать вход.
6. При необходимости запустить нормализатор.
7. Если нормализатор недоступен — применить fallback.
8. Извлечь ЛШ.
9. Проверить source anchors и origin.
10. Построить partial order.
11. Выявить циклы, блокеры, atomic groups и resource conflicts.
12. Определить эффекты.
13. Сформировать AIO и VERIFY checkpoints.
14. Рассчитать coverage budget.
15. Дедуплицировать проверки.
16. Сгруппировать в фазы и задачи.
17. Присвоить risk_level и risk_tags.
18. Проверить команды по environment command policy.
19. Создать rollback/isolation правила.
20. Создать retry_strategy.
21. Создать YAML/NDJSON файловую структуру.
22. Проверить машинную валидность всех артефактов.
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
* пригодным для исполнения агентом без скрытых предположений.

*Конец скилла.*
