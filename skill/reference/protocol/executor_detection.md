# Протокол определения ограничений исполнителя

**Файл:** `reference/protocol/executor_detection.md`
**Назначение:** мета-процедура, выполняемая планировщиком **до генерации плана** (шаг 4б алгоритма §24 ядра). Результат — `executor_profile.resolved.yaml`.
**Принцип:** скилл не знает имён, классов и размеров моделей. Он определяет только **измеримые ограничения** исполнителя.

---

## 1. Почему не шаг плана

Шаги плана порождаются только из исходного материала (принцип незыблемости §2.1 ядра). Сведения о том, какие модели установлены в среде, — мета-информация о **среде исполнения**, а не функциональное требование. Поэтому детекция исполнителя находится рядом с `environment_profile`, а не внутри `Plan_*/`.

## 2. Приоритет источников

Ограничения исполнителя определяются в порядке убывания приоритета:

| Приоритет | Источник | Действие |
|---|---|---|
| 1 | `skill_config.executor.constraints` заданы явно | Использовать как есть, детекцию не выполнять |
| 2 | Явный выбор пользователя в интерактивном режиме | Запросить параметры, зафиксировать `USER_CONFIRMED` |
| 3 | Автодетекция локального провайдера (Ollama и совместимые) | Выполнить процедуру §3 |
| 4 | Ничего не найдено | Консервативный дефолт §5 |

Каждый переход на более низкий приоритет фиксируется в журнале событием `executor_detection`.

## 3. Детекция Ollama и совместимых API

### 3.1. Условие запуска

Детекция выполняется, если выполнено хотя бы одно:

* `skill_config.executor.detection: "auto"` (значение по умолчанию);
* пользователь явно запросил исполнение локальными/суб-агентными моделями;
* в `environment_profile` указан `llm_provider: local | ollama | lmstudio | llamacpp`.

### 3.2. Процедура

```text
1. Проверить доступность Ollama API:
   GET http://localhost:11434/api/tags
   Таймаут: 5 секунд. Один повтор через 2 секунды.

2. Если API отвечает:
   а. Извлечь список моделей из ответа (поле models[]).
   б. Для каждой модели, которую пользователь пометил как кандидата
      (или для единственной доступной, или для указанной в
      skill_config.executor.preferred_model), выполнить:
      POST http://localhost:11434/api/show
      { "name": "<model_name>" }
   в. Из ответа извлечь:
      - model_info -> context_length (если присутствует)
      - parameters / template (информативно)
   г. Если context_length неизвестен — использовать 4096.

3. Вычислить эффективные ограничения:
   effective_context_tokens   = context_length
   max_step_prompt_tokens     = floor(effective_context_tokens × 0.75)
   max_output_tokens          = min(2048, floor(effective_context_tokens × 0.25))
   max_new_lines_per_step     = 150
   structured_output_required = true
   external_context_allowed   = false

4. Зафиксировать в executor_profile.resolved.yaml:
   - источник: "ollama"
   - фактические значения
   - evidence: сырые ответы API (путь к файлу)
```

### 3.3. Совместимые API

Та же процедура применяется к OpenAI-совместимым локальным серверам (`llama.cpp server`, `LM Studio`, `vLLM`), если задан `environment_profile.llm_api_base`:

```text
GET {llm_api_base}/models        → список моделей
POST {llm_api_base}/show          → если поддерживается (Ollama-совместимость)
```

Если сервер не предоставляет `context_length`, использовать консервативный дефолт §5.

### 3.4. Чего не делать

* **Не вшивать список «популярных моделей»** в скилл: он устаревает и нарушает модель-независимость. Скилл перечисляет только то, что реально обнаружено в среде.
* **Не выбирать модель за пользователя.** Если кандидатов несколько и выбор влияет на пороги атомарности (например, 128K vs 8K контекст), в интерактивном режиме запросить выбор; в автономном — взять **наименьший** контекст среди кандидатов (консервативный принцип).
* **Не хранить сырые ответы API в плане.** В план попадает только `executor_profile.resolved.yaml` со значениями и ссылкой на evidence.

## 4. Схема executor_profile.resolved.yaml

```yaml
executor_profile:
  schema_version: "1.1"
  resolved_at: "2026-01-01T12:00:00Z"
  source: "explicit | user_confirmed | ollama | compatible_api | conservative_default"
  detection_evidence_ref: "logs/executor_detection.ndjson"

  constraints:
    max_context_tokens: 8192
    max_step_prompt_tokens: 6144        # floor(context × 0.75)
    max_output_tokens: 2048
    max_new_lines_per_step: 150
    structured_output_required: true
    maximum_actions_per_step: 1
    external_context_allowed: false

  execution:
    mode: "subagent"                    # subagent | single_agent | shell_only
    granularity: "atomic"               # atomic | micro  (standard недопустим, см. ядро §3.2)
    step_retry_max: 3
    drift_check_interval: 10
    escalation: "user"                  # user | escalate_constraints | block
    generation:
      temperature: 0.1
      seed: null

  # Информативные поля (не влияют на пороги):
  observed:
    provider: "ollama"
    model_id: "…"                       # как вернул API; фиксируется в evidence
    context_length_reported: 8192
```

Правила:

1. Пороги атомарности выводятся **только** из `constraints`. Поле `observed.model_id` нормативно не используется.
2. `escalation: escalate_constraints` означает: заблокированный шаг передаётся исполнителю с более широкими ограничениями (тот же контракт). Понятия «большая модель» в спецификации нет.
3. Если `source: conservative_default`, gate пригодности (ядро §12) обязан пометить план предупреждением `EXECUTOR_CONSTRAINTS_ASSUMED`.

## 5. Консервативный дефолт

Применяется, когда ни один источник не дал данных:

```yaml
constraints:
  max_context_tokens: 4096
  max_step_prompt_tokens: 3072
  max_output_tokens: 1024
  max_new_lines_per_step: 60            # режим micro
  structured_output_required: true
  maximum_actions_per_step: 1
  external_context_allowed: false
```

Режим `micro` активируется автоматически при `max_context_tokens ≤ 4096` или явно в конфиге. Он ужесточает `max_new_lines_per_step` до 60 и `max_step_prompt_tokens` до `floor(context × 0.6)`.

## 6. Журналирование

Каждое событие детекции — строка NDJSON:

```json
{"timestamp":"…","action":"executor_detection","result":"success","source":"ollama","constraints":{"max_context_tokens":8192,"max_step_prompt_tokens":6144,"max_output_tokens":2048,"max_new_lines_per_step":150},"message":"2 candidate models found; selected smallest context"}
```

При недоступности API:

```json
{"timestamp":"…","action":"executor_detection","result":"unavailable","source":"ollama","message":"localhost:11434 timeout after 5s; falling back to next priority source"}
```
