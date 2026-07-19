# Схемы артефактов плана

**Файл:** `reference/schemas/plan_artifacts.md`
**Назначение:** полные YAML-схемы файлов структуры `Plan_<plan_name>/`. Ядро `SKILL.md` (§13) содержит дерево структуры и ссылку на этот файл.

---

## 1. environment_profile.yaml

```yaml
environment:
  schema_version: "1.0"
  name: "production"
  profile_type: "production"        # local_dev/ci_pipeline/sandbox/production/production_readonly
  version: "1.0"
  scope: "full"
  execution_mode: "production"      # interactive/autonomous/sandbox/production

  permissions:
    effective_user: "root"
    allowed_privilege_escalation: true
    requires_sudo_confirmation: true

  rollback:
    strategy: "snapshot"            # snapshot/filesystem_backup/manual/none
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
    mode: "restricted"              # allow/restricted/deny
    whitelist:
      - "example.com"
    denylist: []
    allow_localhost: true

  secret_policy:
    mode: "mask"                    # mask/deny_output/strict_control
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
    executable_match_mode: "exact"  # exact/path/prefix
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

### 1.1. Правила проверки команд

1. Проверка `forbidden` выполняется до проверки `allowed`. Запрещённая команда всегда имеет приоритет.
2. Команды хранятся как `argv`, не как свободная shell-строка.
3. Аргументы проверяются отдельно через `allowed_args` и `denied_args`.
4. Shell-выполнение запрещено, если `shell_allowed: false`.
5. Если shell необходим, команда автоматически получает risk tags: `PRIVILEGED` (sudo/root), `DESTRUCTIVE_REVERSIBLE_WITH_SNAPSHOT` или выше (изменение состояния), `SECRET_TOUCHING` (переменные/файлы секретов).
6. Команда без успешной валидации переводит задачу в `BLOCKED`.

## 2. plan_hierarchy.yaml

```yaml
schema_version: "1.1"
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
executor_profile_ref: "executor_profile.resolved.yaml"

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

global_partial_order:
  nodes:
    - "Phase_01"
    - "Phase_02"
  edges:
    - from: "Phase_01"
      to: "Phase_02"
      reason: "Phase_02 depends on installed components"
```

## 3. phase_context.yaml

```yaml
schema_version: "1.1"
phase_id: "Phase_01"
status: "pending"
goal: "Install and validate required packages."

input_state:
  expected:
    - "System is reachable"
    - "Rollback snapshot is available"

completion_criteria:
  - "All tasks completed"
  - "All required verifications passed"
  - "No unresolved HIGH/CRITICAL findings"

tasks:
  - task_id: "task_01"
    path: "tasks/task_01.yaml"

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
  mode: "RESTORE_SNAPSHOT"
  require_confirmation: true

phase_verifications:                # интеграционные проверки уровня фазы
  - id: "PV-01"
    type: "command"
    argv: ["systemctl", "status", "nginx"]
    expected:
      exit_code: 0
```

## 4. task_NN.yaml

```yaml
schema_version: "1.1"
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
  rollback_mode: "RESTORE_SNAPSHOT"
  rollback_available: true
  rollback_verified: true
  require_rollback_confirmation: true

retry_strategy:
  type: "exponential_backoff"       # none/fixed/linear/exponential_backoff
  max_attempts: 10                  # ≤ skill_config.max_task_attempts
  initial_delay_seconds: 5
  max_delay_seconds: 120
  multiplier: 2
  retry_on:                         # см. error_class в reference/protocol/execution.md §5.1
    - "TRANSIENT"
    - "VERIFICATION_FAILURE"
  do_not_retry_on:
    - "PERMISSION_DENIED"
    - "FORBIDDEN_COMMAND"
    - "UNSAFE_ACTION"
    - "VERIFICATION_LOGIC_FAILURE"

steps:                              # атомарные шаги задачи (см. reference/schemas/atomic_step.md)
  - step_id: "AS-0001"
    path: "../steps/step_0001.yaml"

task_verifications:                 # интеграционные проверки уровня задачи
  - id: "TV-01"
    type: "command"
    argv: ["nginx", "-v"]
    expected:
      exit_code: 0

verification_batches:               # необязательно; read-only пакеты (protocol/execution.md §4.1)
  - batch_id: "VB-01"
    tool: "shell_script"
    script_ref: "verifications/vb_01.sh"
    checks:
      - id: "VB-01-1"
        type: "file_exists"
        target: "/etc/nginx/nginx.conf"
      - id: "VB-01-2"
        type: "command"
        argv: ["nginx", "-t"]
```

**Упразднено в v5.1:** `checkpoints` с типами `AIO`/`VERIFY`/`MANUAL` на уровне задачи. Исполняемая единица — `steps`; интеграционная проверка — `task_verifications` / `phase_verifications`; ручная проверка — шаг с `MANUAL`-маркером (ядро §10.2, критерий C4).

## 5. Структура evidence

Evidence — вложенный YAML-объект, не произвольная строка.

```yaml
evidence:
  status: "collected"               # not_collected/collected/failed/redacted/skipped
  collected_at: "2026-01-01T12:00:00Z"
  agent_id: "agent-task-01"
  step_id: "AS-0001"
  attempt: 1

  command:
    argv: ["apt", "install", "nginx"]
    shell: false
    command_hash: "sha256:..."

  result:
    exit_code: 0
    duration_ms: 12345
    timed_out: false

  output:
    stdout_ref: "logs/artifacts/AS-0001_stdout.txt"
    stderr_ref: "logs/artifacts/AS-0001_stderr.txt"
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

  redactions:
    - kind: "secret"
      pattern_id: "token"
      occurrences: 1

  executor:
    provider: "ollama"
    model_id: "..."
    temperature: 0.1
    seed: null

  verifier:
    verifier_id: "agent-task-01"
    verification_time: "2026-01-01T12:00:02Z"

  deviation:
    occurred: false
    description: null
```

## 6. phase_execution_log.ndjson

Каждая строка — отдельное событие:

```json
{"timestamp":"2026-01-01T12:00:00Z","agent_id":"agent-phase-01","phase_id":"Phase_01","task_id":"task_01","step_id":"AS-0001","action":"execute_step","result":"success","risk_level":"HIGH","risk_tags":["PRIVILEGED","NETWORKED"],"error_class":null,"attempt":1,"deviation":{"occurred":false,"description":null},"message":"Step completed","evidence_ref":"tasks/task_01.yaml#/steps/AS-0001/evidence"}
```

Допустимые `result`: `success`, `failure`, `skipped`, `blocked`, `retry`, `fatal`.

## 7. final_report.yaml

```yaml
final_report:
  schema_version: "1.1"
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
    step_count: 48
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

## 8. executor_readiness.yaml (gate)

```yaml
executor_readiness:
  schema_version: "1.1"
  checks:
    - id: "R1"
      name: "all_steps_pass_atomicity_criteria"
      passed: true
    - id: "R2"
      name: "all_steps_fit_context_budget"
      passed: true
    - id: "R3"
      name: "every_step_has_machine_done_criteria"
      passed: true
    - id: "R4"
      name: "all_dependencies_materialized_as_artifacts"
      passed: true
    - id: "R5"
      name: "no_step_references_context_outside_contract"
      passed: true
    - id: "R6"
      name: "prompt_template_present_and_valid"
      passed: true
    - id: "R7"
      name: "lsh_step_coverage_bidirectional"
      passed: true
    - id: "R8"
      name: "no_ambiguous_goal_verbs"
      passed: true
  warnings:
    - "EXECUTOR_CONSTRAINTS_ASSUMED"   # если источник ограничений — conservative_default
  result: "READY"                    # READY/NOT_READY
  defects: []
```

Правила: провал любой проверки → `NOT_READY` с перечнем дефектов → `PLAN_WITH_BLOCKERS`. Gate не заменяет аудит §18 ядра.
