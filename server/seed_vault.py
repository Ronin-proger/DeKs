"""wipe vault md notes and seed interconnected demo notes"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from database import get_connection, init_db
from intelligence.vault_sync import sync_vault
from intelligence_config import OBSIDIAN_VAULT_PATH
from obsidian_client import write_note_local

SEED_NOTES = {
    "DeKs — обзор.md": """# DeKs — обзор

Корпоративный портал: [[Дашборд/Виджеты и задачи]], [[Мессенджер/Корпоративный чат]], [[NeuroVault/Граф знаний]].

## Цели
- Единая точка входа для команды
- Аналитика и совместная работа
- Интеграция с [[AI/Ollama и ассистенты]]

Связанные процессы: [[Процессы/Онбординг сотрудника]], [[Процессы/Еженедельный стендап]].
""",
    "NeuroVault/Граф знаний.md": """# NeuroVault — граф знаний

Модуль Obsidian в портале. После [[Процессы/Sync vault]] строит граф и метрики.

## Возможности
- Wikilinks между заметками
- Семантические связи через [[AI/Ollama и ассистенты]]
- [[AI/RAG чат по заметкам]] с цитированием источников

См. также [[Аналитика/Синергия и риски]] и [[DeKs — обзор]].
""",
    "Мессенджер/Корпоративный чат.md": """# Корпоративный мессенджер

Личные и групповые комнаты в [[DeKs — обзор]].

## Функции
- Непрочитанные сообщения на дашборде
- Удаление личных чатов
- Уведомления в реальном времени

Новым сотрудникам: начните с [[Процессы/Онбординг сотрудника]].
""",
    "AI/Ollama и ассистенты.md": """# Ollama и AI-ассистенты

Локальные модели для чата и embeddings.

## Модели
- `qwen2.5:1.5b` — общий чат
- `nomic-embed-text` — векторы для [[NeuroVault/Граф знаний]]

Используется в [[AI/RAG чат по заметкам]] и виджете AI на [[Дашборд/Виджеты и задачи]].
""",
    "AI/RAG чат по заметкам.md": """# RAG-чат по заметкам

Вопросы по содержимому vault с ответами и ссылками на источники.

Требует:
1. [[Процессы/Sync vault]]
2. Запущенную [[AI/Ollama и ассистенты]]
3. Осмысленные связи между заметками ([[NeuroVault/Граф знаний]])

Пример темы: см. [[Проекты/Проект Alpha]].
""",
    "Дашборд/Виджеты и задачи.md": """# Дашборд — виджеты и задачи

Главный экран [[DeKs — обзор]].

## Виджеты
- Задачи и [[Дашборд/Календарь событий]]
- Быстрые ссылки и документы
- График продаж
- AI-ассистент → [[AI/Ollama и ассистенты]]

Поиск по всем разделам портала из шапки.
""",
    "Дашборд/Календарь событий.md": """# Календарь событий

Планирование встреч и дедлайнов. Связан с задачами на [[Дашборд/Виджеты и задачи]].

Рекомендуется синхронизировать с [[Процессы/Еженедельный стендап]].
""",
    "Дашборд/Парсинг сайтов.md": """# Парсинг внешних данных

Извлечение текста, ссылок и таблиц с URL для отчётов.

Результаты можно оформить заметками в [[NeuroVault/Граф знаний]] и обсудить в [[Мессенджер/Корпоративный чат]].
""",
    "Аналитика/Синергия и риски.md": """# Синергия и риски vault

Метрики в NeuroVault:
- **Синергия** — кросс-доменные связи
- **Загруженность заметок** — активность правок
- **Риски** — устаревание, утечка знаний

Подробнее: [[NeuroVault/Граф знаний]], [[Процессы/Sync vault]].
""",
    "Процессы/Онбординг сотрудника.md": """# Онбординг сотрудника

1. Вход в [[DeKs — обзор]]
2. Настройка профиля и языка
3. Подключение Obsidian → [[Процессы/Sync vault]]
4. Знакомство с [[Команда/Роли в проекте]]
5. Первый чат в [[Мессенджер/Корпоративный чат]]
""",
    "Процессы/Еженедельный стендап.md": """# Еженедельный стендап

Формат:
- Статус по [[Проекты/Проект Alpha]]
- Блокеры в [[Дашборд/Виджеты и задачи]]
- Новые идеи в [[NeuroVault/Граф знаний]]

Календарь: [[Дашборд/Календарь событий]].
""",
    "Процессы/Sync vault.md": """# Синхронизация vault

Кнопка **Sync vault** в NeuroVault:
- Индексирует заметки Obsidian
- Пересчитывает embeddings ([[AI/Ollama и ассистенты]])
- Обновляет [[Аналитика/Синергия и риски]]

После sync запустите поиск связей Ollama в [[NeuroVault/Граф знаний]].
""",
    "Проекты/Проект Alpha.md": """# Проект Alpha

Пилотный корпоративный проект.

## Команда
См. [[Команда/Роли в проекте]].

## Документация
- Архитектура: [[Архитектура/Backend и API]]
- UI: [[Архитектура/Frontend React]]
- Знания: [[NeuroVault/Граф знаний]]

Статус обсуждается на [[Процессы/Еженедельный стендап]].
""",
    "Команда/Роли в проекте.md": """# Роли в проекте

| Роль | Зона |
|------|------|
| Team Lead | [[Проекты/Проект Alpha]] |
| Backend | [[Архитектура/Backend и API]] |
| Frontend | [[Архитектура/Frontend React]] |
| Аналитик | [[Аналитика/Синергия и риски]] |

Онбординг: [[Процессы/Онбординг сотрудника]].
""",
    "Архитектура/Backend и API.md": """# Backend — FastAPI

Сервисы портала [[DeKs — обзор]]:
- `/api/intelligence/*` — [[NeuroVault/Граф знаний]]
- `/api/messenger/*` — [[Мессенджер/Корпоративный чат]]
- `/api/chat` — [[AI/Ollama и ассистенты]]

SQLite для workspace и индекса заметок.
""",
    "Архитектура/Frontend React.md": """# Frontend — React

Клиент Vite + React:
- [[Дашборд/Виджеты и задачи]]
- Страница Obsidian / NeuroVault
- [[AI/RAG чат по заметкам]] (вкладка в vault)

Прокси API на порт 3001.
""",
}


def delete_all_markdown(vault: Path) -> int:
    removed = 0
    if not vault.exists():
        return removed
    for file_path in vault.rglob("*.md"):
        parts = set(file_path.parts)
        if "plugins" in parts:
            continue
        file_path.unlink(missing_ok=True)
        removed += 1
    return removed


def clear_index() -> None:
    init_db()
    with get_connection() as conn:
        conn.execute("DELETE FROM ai_note_links")
        conn.execute("DELETE FROM obsidian_links")
        conn.execute("DELETE FROM note_embeddings")
        conn.execute("DELETE FROM obsidian_notes")
        conn.execute("DELETE FROM intelligence_insights")
        conn.execute("DELETE FROM sync_state")
        conn.commit()


def seed_notes() -> int:
    count = 0
    for rel_path, content in SEED_NOTES.items():
        write_note_local(rel_path, content.strip() + "\n")
        count += 1
    return count


def main():
    vault = OBSIDIAN_VAULT_PATH
    print(f"Vault: {vault}")
    removed = delete_all_markdown(vault)
    print(f"Removed {removed} markdown files")
    clear_index()
    print("Cleared database index")
    created = seed_notes()
    print(f"Created {created} notes")
    result = sync_vault(force=True)
    print(result.get("message", result))
    print(f"Links in index: {result.get('metrics', {}).get('linksTotal', '?')}")
    print("Done. Open Obsidian and press Sync vault in NeuroVault if needed.")


if __name__ == "__main__":
    main()
