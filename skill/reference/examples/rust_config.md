# Сквозной нормативный пример

**Файл:** `reference/examples/rust_config.md`
**Назначение:** эталон декомпозиции и контрактов для планировщика. Демонстрирует корректное применение правил v5.1, включая форматы вывода (§2 `reference/schemas/atomic_step.md`).

---

## 1. Исходный фрагмент

Фрагмент `input.md`:

```markdown
88: Добавь в проект файл src/config.rs со структурой Config:
89: поля host (String), port (u16), debug (bool).
90: Реализуй для Config трейт Default: host "127.0.0.1", port 8080, debug false.
91: Проверь сборку командой cargo check.
```

## 2. Декомпозиция

Планировщик порождает задачу `task_07` и три шага:

| Шаг | Действие | Проверка |
|---|---|---|
| `AS-0042` | `CREATE_FILE src/config.rs` (структура + derive) | `file_exists` + `grep "pub struct Config"` |
| `AS-0043` | `APPEND_FILE src/config.rs` (реализация Default) | `grep "impl Default for Config"` |
| `AS-0044` | `RUN_COMMAND ["cargo", "check"]` | `exit_code == 0` |

**Почему так, а не иначе (v5.0 → v5.1):**

* В v5.0 `cargo check` был одновременно `done_criteria` шага `AS-0043` **и** отдельным шагом `AS-0044` — дубль, нарушающий принцип дедупликации. В v5.1 у `AS-0043` — только локальная проверка (grep), а компиляция — отдельный шаг `AS-0044` как явное требование источника (строка 91, `origin: EXPLICIT`).
* У `AS-0043` формат вывода исправлен с небезопасного `FULL_FILE` на `APPEND_PAYLOAD` (см. §3.2).

## 3. Контракты

### 3.1. AS-0042 — создание файла

```yaml
atomic_step:
  schema_version: "1.1"
  step_id: "AS-0042"
  task_id: "task_07"
  phase_id: "Phase_02"
  status: "pending"
  origin: "EXPLICIT"
  source_lsh: ["LSH-018"]
  source_anchor:
    file: "input.md"
    line_start: 88
    line_end: 89
    quote_hash: "sha256:..."
  goal: "Создать файл src/config.rs со структурой Config с полями host, port, debug"
  action:
    type: "CREATE_FILE"
    target: "src/config.rs"
  knowledge_boundary:
    facts:
      - "Проект использует Rust edition 2021"
      - "Поля Config: host (String), port (u16), debug (bool)"
    inputs: []
    must_not_assume:
      - "Наличие любых файлов, кроме перечисленных в context_pack"
    on_missing_info: "BLOCKED"
  context_pack:
    - kind: "file_excerpt"
      path: "Cargo.toml"
      lines: "1-20"
      sha256: "sha256:..."
  output_contract:
    format: "FULL_FILE"
    language: "rust"
    success_marker: "STEP_OK"
    blocked_marker: "STEP_BLOCKED"
    prohibited_output:
      - "пояснения вне кода"
      - "markdown-обёртки"
  done_criteria:
    - id: "DC-1"
      type: "file_exists"
      target: "src/config.rs"
    - id: "DC-2"
      type: "grep"
      target: "src/config.rs"
      pattern: "pub struct Config"
  negative_constraints:
    - "Не изменять никакой файл, кроме src/config.rs"
    - "Не добавлять зависимости"
  risk_level: "LOW"
  risk_tags: ["REVERSIBLE"]
  retry_policy:
    max_attempts: 3
    on_failure: "retry_with_error_feedback"
    then: "BLOCKED"
  rollback:
    mode: "REVERSE_ACTION"
    target: "src/config.rs"
```

После успеха содержимое файла публикуется как артефакт `ART-0018`.

### 3.2. AS-0043 — дописывание реализации Default

```yaml
atomic_step:
  schema_version: "1.1"
  step_id: "AS-0043"
  task_id: "task_07"
  phase_id: "Phase_02"
  status: "pending"
  origin: "EXPLICIT"
  source_lsh: ["LSH-019"]
  source_anchor:
    file: "input.md"
    line_start: 90
    line_end: 90
    quote_hash: "sha256:..."
  goal: "Добавить в конец src/config.rs реализацию Default для Config"
  action:
    type: "APPEND_FILE"
    target: "src/config.rs"
  knowledge_boundary:
    facts:
      - "Проект использует Rust edition 2021"
      - "Значения Default: host \"127.0.0.1\", port 8080, debug false"
    inputs:
      - artifact_id: "ART-0018"
        ref: "artifacts/ART-0018_config_rs_after_AS-0042.rs"
        sha256: "sha256:..."
        inject: "full"
    must_not_assume:
      - "Существование других impl-блоков"
      - "Наличие каких-либо файлов, кроме предоставленного ART-0018"
    on_missing_info: "BLOCKED"
  context_pack:
    - kind: "file_full"
      path: "src/config.rs"
      from_artifact: "ART-0018"
      sha256: "sha256:..."
  output_contract:
    format: "APPEND_PAYLOAD"          # исполнитель возвращает ТОЛЬКО добавляемый фрагмент
    language: "rust"
    success_marker: "STEP_OK"
    blocked_marker: "STEP_BLOCKED"
    prohibited_output:
      - "повторение существующего содержимого файла"
      - "пояснения вне кода"
      - "markdown-обёртки"
  done_criteria:
    - id: "DC-1"
      type: "grep"
      target: "src/config.rs"
      pattern: "impl Default for Config"
    - id: "DC-2"
      type: "grep"
      target: "src/config.rs"
      pattern: "host: \"127.0.0.1\""
  negative_constraints:
    - "Вернуть только добавляемый фрагмент, без существующего содержимого"
    - "Не добавлять зависимости и внешние crate"
    - "Не вводить полей, отсутствующих в facts"
  risk_level: "LOW"
  risk_tags: ["REVERSIBLE"]
  retry_policy:
    max_attempts: 3
    on_failure: "retry_with_error_feedback"
    then: "BLOCKED"
  rollback:
    mode: "RESTORE_FROM_ARTIFACT"
    artifact_id: "ART-0018"
```

**Обработка оркестратором:** получив `APPEND_PAYLOAD`, оркестратор сам дописывает фрагмент в конец `src/config.rs`. Исполнитель физически не может изменить существующее содержимое — оно ему не возвращается и не принимается.

### 3.3. AS-0044 — проверка сборки

```yaml
atomic_step:
  schema_version: "1.1"
  step_id: "AS-0044"
  task_id: "task_07"
  phase_id: "Phase_02"
  status: "pending"
  origin: "EXPLICIT"
  source_lsh: ["LSH-020"]
  source_anchor:
    file: "input.md"
    line_start: 91
    line_end: 91
    quote_hash: "sha256:..."
  goal: "Выполнить cargo check для проверки сборки проекта"
  action:
    type: "RUN_COMMAND"
    target: "cargo check"
  command:
    argv: ["cargo", "check"]
    shell: false
    timeout_seconds: 300
  knowledge_boundary:
    facts:
      - "Команда выполняется в корне проекта"
    inputs: []
    must_not_assume:
      - "Результаты сборки до выполнения команды"
    on_missing_info: "BLOCKED"
  context_pack: []
  output_contract:
    format: "COMMAND_OUTPUT"
    success_marker: "STEP_OK"
    blocked_marker: "STEP_BLOCKED"
  done_criteria:
    - id: "DC-1"
      type: "command"
      argv: ["cargo", "check"]
      expected:
        exit_code: 0
  negative_constraints:
    - "Не изменять никакие файлы проекта"
  risk_level: "LOW"
  risk_tags: ["SAFE"]
  retry_policy:
    max_attempts: 2
    on_failure: "retry_with_error_feedback"
    then: "BLOCKED"
  rollback:
    mode: "NONE"                     # read-only команда, откат не требуется
    justification: "Команда не изменяет состояние"
```

## 4. Материализованный промпт AS-0043 (сокращён показ)

```text
# РОЛЬ
Ты — исполнитель одного атомарного шага плана. ...

# ЗАДАЧА
Добавить в конец src/config.rs реализацию Default для Config

# ДЕЙСТВИЕ
Тип: APPEND_FILE
Цель: src/config.rs

# ФАКТЫ
- Проект использует Rust edition 2021
- Значения Default: host "127.0.0.1", port 8080, debug false

# ВХОДНЫЕ ДАННЫЕ
<полное содержимое src/config.rs после шага AS-0042>

# ФОРМАТ ОТВЕТА
Первая строка — маркер STEP_OK или STEP_BLOCKED.
Далее — только добавляемый фрагмент кода, без существующего содержимого файла.

# ЗАПРЕТЫ
- Вернуть только добавляемый фрагмент, без существующего содержимого
- Не добавлять зависимости и внешние crate
- Не вводить полей, отсутствующих в фактах
- Не задавать уточняющих вопросов

# КРИТЕРИИ ГОТОВНОСТИ
- Файл src/config.rs содержит строку "impl Default for Config"
- Файл src/config.rs содержит строку "host: \"127.0.0.1\""

# ЕСЛИ НЕ ХВАТАЕТ ДАННЫХ
Не угадывай. Ответь ровно: STEP_BLOCKED: <чего не хватает>
```

## 5. Допустимый вывод исполнителя

```text
STEP_OK
impl Default for Config {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 8080,
            debug: false,
        }
    }
}
```

Обратите внимание: вывод содержит **только добавляемый фрагмент** — в v5.0 исполнитель обязан был вернуть весь файл, что открывало канал незаметной мутации.

## 6. Верификация и публикация

1. Оркестратор дописывает payload в `src/config.rs`.
2. `grep` находит `impl Default for Config` (DC-1 пройден), `host: "127.0.0.1"` (DC-2 пройден).
3. `status: success`; новое содержимое публикуется как `ART-0019` для потребителей.
4. Evidence записывается по схеме `reference/schemas/plan_artifacts.md` §5.
5. Шаг `AS-0044` выполняет `cargo check` как независимую явную проверку из источника.
