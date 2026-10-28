from openai import AsyncOpenAI

OLLAMA_BASE_URL = "http://localhost:11434/v1"
DEFAULT_MODEL = "qwen2.5:1.5b"
SYSTEM_PROMPT = (
    "Ты помощник продукта. Отвечай на языке пользователя; "
    "если язык неясен — на русском. Опирайся на контекст сообщения. "
    "Пиши кратко, обычным Markdown."
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
