# Upstream-планы: hermetic-тесты и side-effect review

Использовать при планировании upstream-исправлений, где симптомы отличаются между прямым `pytest` и canonical/CI-parity runner.

## 1. Диагностический протокол

1. Обновить `origin/main` и зафиксировать SHA.
2. Создать отдельный worktree; установленный checkout не использовать как implementation base.
3. Разделить прогоны:
   - direct pytest — локализация причины;
   - canonical runner — проверка runner/environment;
   - clean-run loop — проверка flaky-гипотезы без retry-маскировки.
4. Зафиксировать отдельными артефактами stdout/stderr, exit code и классификацию.

Разница `direct=green`, `canonical=red` сначала трактуется как environment/runner effect, а не как flaky production-код.

## 2. Windows home-isolation

На Windows подмена только `HOME` недостаточна: `pathlib.Path.home()` может опираться на `USERPROFILE` или на пару `HOMEDRIVE`+`HOMEPATH`.

Перед любым диагностическим тестом, способным раскрыть `~` или legacy-путь:

```bash
export HOME="$PLAN_SANDBOX_HOME"
export USERPROFILE="$PLAN_SANDBOX_HOME"
export HOMEDRIVE='C:'
export HOMEPATH="$PLAN_SANDBOX_HOME"
unset HERMES_HOME HERMES_CONFIG
```

Для canonical runner проверить, что `env -i` сохраняет только необходимые non-secret Windows variables. Не передавать весь родительский environment.

## 3. До/после манифест реального home

Hash-манифест должен быть read-only и фиксировать относительный путь + SHA-256, без содержимого секретных файлов. После тестов сравнить before/after. Проверять минимум:

- реальный `~/.hindsight`;
- реальный `~/.hermes`, если код может использовать `Path.home()` напрямую;
- активные config-файлы Hermes.

Если baseline-тесты уже могут писать в real home, сначала исправить sandbox запуска; одного отрицательного ограничения в prompt недостаточно.

## 4. Артефакты и динамические значения

Проверять двустороннее соответствие:

```text
artifact_id
  == registry.artifacts[].artifact_id
  → registry.path
  == consumer.knowledge_boundary.inputs[].ref
  → producer/consumer IDs согласованы
```

Remote owner, fork name, PR number, runtime path и другие неизвестные во время генерации значения нельзя оставлять как `<placeholder>` в исполняемой команде. Получить значение отдельным шагом, записать в артефакт, передать следующим шагам по `artifact_id`; при невозможности — `BLOCKED` или confirmation gate.

## 5. Минимальный safety-lint перед READY

Проверить автоматически:

- весь YAML/NDJSON парсится;
- step IDs уникальны и последовательны;
- каждый шаг имеет `done_criteria`;
- LSH↔step coverage двусторонний;
- все `inputs.ref` совпадают с registry path;
- нет незаполненных placeholders в `argv`;
- protected paths не входят в writable paths;
- baseline и verification commands используют sandbox;
- before/after manifest действительно потребляется финальной проверкой;
- `push`, PR, merge и другие внешние side effects имеют отдельное подтверждение.

## 6. Drift после baseline и rebase перед commit

Baseline нельзя считать действительным до конца исполнения: `origin/main` может измениться пока идут stress/full-suite тесты. Перед staging и commit повторить проверку:

```text
HEAD == origin/main
worktree contains only allowlisted changes
```

При drift: сохранить staged/unstaged/untracked изменения в worktree-local stash/patch, rebase на новый `origin/main`, восстановить изменения и повторить финальный targeted gate; обновить baseline-artifact и source hashes. Не смешивать результаты старой базы с результатами финальной ветки.

## 7. Desktop-session isolation

Если исполнитель работает внутри Hermes Desktop, execution-worktree должен быть также anchor path отдельного Desktop Project. `terminal(workdir=...)` снижает риск, но не заменяет переключение Project: последующие файловые и shell-инструменты могут использовать текущий workspace.

## 8. Staging и Git identity gate

Перед commit:

1. `git diff --cached --name-only` должен в точности совпасть с allowlist.
2. Проверить `git status --porcelain`; generated/untracked files не должны попасть в commit случайно.
3. Проверить локальные `user.name/user.email`. При отсутствии identity оставить staged изменения как есть и запросить имя/email пользователя. Не использовать upstream author и не менять global config без разрешения.
4. После commit проверить clean status и `git show --stat`.

## 9. Шум процесса и настоящие результаты

Exit code 0 не отменяет stack trace из callback, Unicode-ошибки печати или permission failure в отдельном тесте. Фиксировать их как отдельные observations; классифицировать по связи с diff и воспроизводимости. Не объявлять suite полностью чистым, если pre-existing/environment failure был скрыт runner-агрегацией. В PR включать только относящиеся к причине изменения.

Этот execution-gate дополняет диагностический протокол и safety-lint выше: он защищает финальную базу, область commit и честность итогового отчёта.