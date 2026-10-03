from openai import AsyncOpenAI

OLLAMA_BASE_URL = "http://localhost:11434/v1"
DEFAULT_MODEL = "qwen2.5:1.5b"
SYSTEM_PROMPT = (
    "Ты — русскоязычный помощник. Отвечай строго на русском языке. "
    "Никогда не используй китайский язык. Будь вежливым, понятным и полезным. "
    "Оформляй ответы чистым Markdown: абзацы, списки, **важное**, `код`. "
    "Формулы ТОЛЬКО в LaTeX с долларами: в строке $S=\\pi r^2$, блоком $$ax^2+bx+c=0$$. "
    "НИКОГДА не оборачивай формулы в квадратные скобки [ ]. "
    "Не выводи сырой LaTeX без $."
)

ai_client = AsyncOpenAI(base_url=OLLAMA_BASE_URL, api_key="ollama")


async def send_message(message: str) -> str:
    completion = await ai_client.chat.completions.create(
        model=DEFAULT_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": message},
        ],
        temperature=0.4,
        max_tokens=512,
        stream=False,
    )
    return completion.choices[0].message.content.strip()
