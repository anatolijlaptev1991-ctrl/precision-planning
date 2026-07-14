# История изменений

## 1.0.3 — 2026-07-14

- Каноническое имя скилла изменено на `laptev-plan`, как у `laptev-plan-impl`.
- Скилл теперь устанавливается в общий каталог Hermes `skills/software-development/laptev-plan/`.
- Команда `/laptev-plan` теперь создаётся самим skill scanner во всех сессиях.
- `/laptev_plan` и `/precision-planning` сохранены как совместимые aliases.
- Установщик мигрирует старый рекурсивный alias `/laptev-plan`.

## 1.0.2 — 2026-07-14

- Исправлена доступность команды `/laptev-plan`.
- Установщик теперь регистрирует оба alias: `/laptev-plan` и `/laptev_plan`.
- Сохранено прямое имя скилла `/precision-planning`.
- `status` и `uninstall` теперь проверяют и удаляют оба alias.

## 1.0.0 — 2026-07-14

- Добавлен Precision Planning Skill v6.0.0.
- Добавлен npm-установщик `precision-planning`.
- Добавлена установка скилла в Hermes Agent.
- Добавлена автозагрузка через `HERMES_TUI_SKILLS`.
- Добавлен alias `/laptev_plan`.
- Добавлены команды `install`, `status` и `uninstall`.
- Добавлено сравнение с Claude Code, Google Antigravity, OpenAI Codex, OpenCode и ZCode.
