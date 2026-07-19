# Схема контракта атомарного шага и шаблон промпта

**Файл:** `reference/schemas/atomic_step.md`
**Назначение:** полная нормативная схема `atomic_step`, форматы вывода и обязательный шаблон промпта исполнителя. Ядро `SKILL.md` (§11) содержит только краткое резюме и ссылку на этот файл.

---

## 1. Полная схема atomic_step

```yaml
atomic_step:
  schema_version: "1.1"
  step_id: "AS-0042"
  task_id: "task_07"
  phase_id: "Phase_02"
  status: "pending"

  origin: "EXPLICIT"
  source_lsh:
    - "LSH-018"
  source_anchor:
    file: "input.md"
    line_start: 88
    line_end: 92
    quote_hash: "sha256:..."

  # Один императив ≤ 25 слов, конкретный объект (C8)
  goal: "Создать файл src/config.rs со структурой Config по схеме ART-0017"

  action:
    type: "CREATE_FILE"        # см. §1.1
    target: "src/config.rs"    # ровно один целевой ресурс (C2)

  knowledge_boundary:
    facts:
      - "Проект использует Rust edition 2021"
      - "Сериализация конфигурации — serde + toml"
    inputs:
      - artifact_id: "ART-0017"
        ref: "artifacts/ART-0017_config_schema.yaml"
        sha256: "sha256:..."
        inject: "full"         # full/excerpt/summary
    must_not_assume:
      - "Наличие любых файлов, кроме перечисленных в context_pack"
      - "Содержимое файлов, не предоставленное в контракте"
    on_missing_info: "BLOCKED"

  context_pack:
    - kind: "file_excerpt"     # file_full/file_excerpt/code_snippet/schema/text
      path: "Cargo.toml"
      lines: "1-20"
      sha256: "sha256:..."

  output_contract:
    format: "FULL_FILE"        # см. §2: FULL_FILE/UNIFIED_DIFF/APPEND_PAYLOAD/JSON_OBJECT/COMMAND_OUTPUT
    language: "rust"
    success_marker: "STEP_OK"
    blocked_marker: "STEP_BLOCKED"
    prohibited_output:
      - "пояснения вне целевого формата"
      - "markdown-обёртки сверх указанного формата"

  done_criteria:               # минимум 1, машинно выполнимые (C4)
    - id: "DC-1"
      type: "file_exists"
      target: "src/config.rs"
    - id: "DC-2"
      type: "grep"
      target: "src/config.rs"
      pattern: "pub struct Config"

  negative_constraints:        # обязательны для действий, меняющих состояние
    - "Не изменять никакой файл, кроме src/config.rs"
    - "Не добавлять зависимости"
    - "Не вводить типы, отсутствующие в inputs"

  risk_level: "LOW"
  risk_tags:
    - REVERSIBLE

  retry_policy:
    max_attempts: 3            # ≤ executor.step_retry_max; иерархия — reference/protocol/execution.md §5
    on_failure: "retry_with_error_feedback"
    then: "BLOCKED"

  rollback:
    mode: "REVERSE_ACTION"     # таксономия — reference/protocol/execution.md §6.1
    target: "src/config.rs"
```

### 1.1. Закрытый список типов действия

`CREATE_FILE`, `EDIT_FILE`, `APPEND_FILE`, `DELETE_FILE`, `WRITE_CONFIG_KEY`, `RUN_COMMAND`, `READ_FILE`, `ASSERT_STATE`.

### 1.2. Правила контракта

1. Контракт неизменяем после выдачи исполнителю. Любое изменение — новая версия контракта и событие в журнале.
2. Для `EDIT_FILE` и `APPEND_FILE` `context_pack` обязан содержать актуальное содержимое целевого файла (полное или дифф-фрагменты) с `sha256`. Перед выдачей шага оркестратор сверяет хеш реального файла с хешем в контракте; при расхождении шаг пересобирается с обновлённым контекстом и фиксируется событие дрейфа.
3. Типы `done_criteria`: `file_exists`, `file_not_exists`, `command` (с `expected`), `grep`, `grep_absent`, `json_path`, `hash_equals`, `test_pass`. Минимум один критерий на шаг.
4. `negative_constraints` обязательны для всех действий, изменяющих состояние.
5. Идентификаторы, пути, имена и версии переносятся в контракт из исходного материала дословно, без перефразирования.

## 2. Форматы вывода и соответствие действиям

**Нормативное правило:** формат вывода не должен давать исполнителю канал мутации сверх разрешённого действием.

| action.type | Обязательный output_contract.format | Применение результата оркестратором |
|---|---|---|
| `CREATE_FILE` | `FULL_FILE` | Атомарная запись (temp + rename) |
| `EDIT_FILE` | `UNIFIED_DIFF` | Применить патч; проверить `unchanged_regions_hash` |
| `APPEND_FILE` | `APPEND_PAYLOAD` | Оркестратор **сам** дописывает payload в конец файла |
| `DELETE_FILE` | `JSON_OBJECT` (подтверждение цели) | Удаление после сверки с `target` |
| `WRITE_CONFIG_KEY` | `JSON_OBJECT` `{key, value}` | Точечная запись ключа |
| `RUN_COMMAND` | `COMMAND_OUTPUT` | Выполнение argv через command policy |
| `READ_FILE` | `JSON_OBJECT` (сводка/фрагмент) | Без мутации |
| `ASSERT_STATE` | `JSON_OBJECT` (результат проверки) | Без мутации |

### 2.1. Защита неизменяемых областей для EDIT_FILE

Контракт `EDIT_FILE` обязан содержать:

```yaml
output_contract:
  format: "UNIFIED_DIFF"
  unchanged_regions_hash:
    algorithm: "sha256"
    of: "file_minus_diff_hunks"   # хеш содержимого за пределами изменяемых фрагментов
```

После применения патча оркестратор пересчитывает хеш неизменяемых областей. Расхождение — `VERIFICATION_FAILURE`, шаг откатывается (`RESTORE_FROM_ARTIFACT`).

### 2.2. Запрещённые сочетания

* `APPEND_FILE` → `FULL_FILE` (канал незаметной мутации существующего содержимого).
* `EDIT_FILE` → `FULL_FILE` без `unchanged_regions_hash`.
* `DELETE_FILE` → любой формат, несущий содержимое других файлов.

## 3. Обязательный шаблон промпта исполнителя

Оркестратор формирует промпт строго по шаблону `templates/atomic_step_prompt.md` и ничего не добавляет от себя. Промпт одного вызова содержит ровно один шаг.

```text
# РОЛЬ
Ты — исполнитель одного атомарного шага плана. Ты выполняешь ровно одно
действие и отвечаешь строго в заданном формате. У тебя нет никакой
информации, кроме приведённой ниже. Всё, чего здесь нет, для тебя не существует.

# ЗАДАЧА
{{goal}}

# ДЕЙСТВИЕ
Тип: {{action.type}}
Цель: {{action.target}}

# ФАКТЫ
Считай истиной только следующее:
{{facts}}

# ВХОДНЫЕ ДАННЫЕ (результаты предыдущих шагов)
{{inputs_materialized}}

# КОНТЕКСТ
{{context_pack_materialized}}

# ФОРМАТ ОТВЕТА
{{output_contract_instructions}}
Первая строка ответа — ровно один маркер: {{success_marker}} или {{blocked_marker}}.

# ЗАПРЕТЫ
{{negative_constraints}}
— Не выходи за пределы цели действия.
— Не добавляй ничего, чего нет в ФАКТАХ и ВХОДНЫХ ДАННЫХ.
— Не задавай уточняющих вопросов.

# КРИТЕРИИ ГОТОВНОСТИ (будут проверены машинно)
{{done_criteria_human_readable}}

# ЕСЛИ НЕ ХВАТАЕТ ДАННЫХ
Не угадывай. Ответь ровно:
{{blocked_marker}}: <чего конкретно не хватает>
```

Правила:

1. Язык промпта — язык исходного материала.
2. Запрещено включать в промпт сведения о других шагах, кроме материализованных `inputs`.
3. Запрещено менять состав и порядок секций: исполнители с ограниченным контекстом выигрывают от фиксированной повторяющейся структуры.
4. При повторной попытке в конец добавляется секция `# ОШИБКА ПРЕДЫДУЩЕЙ ПОПЫТКИ` с дословным текстом непройденной проверки или ошибки парсинга.

## 4. Реестр артефактов (нормативная схема)

```yaml
artifacts_registry:
  schema_version: "1.1"
  artifacts:
    - artifact_id: "ART-0017"
      type: "schema"           # file/excerpt/value/command_output/schema/interface
      producer_step: "AS-0038"
      path: "artifacts/ART-0017_config_schema.yaml"
      sha256: "sha256:..."
      created_at: "2026-01-01T12:00:00Z"
      consumers:
        - "AS-0042"
        - "AS-0043"
```

Правила:

1. Если шаг M использует результат шага N, в графе обязано быть ребро N → M, а в `inputs` шага M — соответствующий артефакт. Отсутствие артефакта при наличии зависимости — дефект плана.
2. Артефакт неизменяем после публикации. Новая версия результата получает новый `artifact_id`.
3. Перед выдачей шага оркестратор материализует `inputs` и проверяет их хеши. Расхождение хеша — событие дрейфа и пересборка шага.
4. Передача данных между шагами вне реестра запрещена.
