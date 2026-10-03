DeSk
Веб-приложение для организации рабочего пространства и управления знаниями
О проекте
DeSk — это единое цифровое пространство, объединяющее корпоративный мессенджер, систему управления задачами, календарь, файловое хранилище, базу знаний и AI-ассистента. Проект решает проблему разрозненности инструментов в IT-компаниях, где сотрудники вынуждены использовать до 5-7 различных приложений ежедневно.

Запуск 
cd server
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate # Linux / macOS

pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 5174 --reload

cd client
npm install
npm run dev -- --port 3000

Также запуск через Docker 
docker-compose up -d

По необходимости установить необходимые зависимости через pip install и так далее
pip install -r requirements.txt
или pip install fastapi uvicorn python-multipart httpx beautifulsoup4
проверьте установку 
uvicorn --version
запуск сервера uvicorn main:app --host 0.0.0.0 --port 3001 --reload
, требования для запуска кода:

Установка и запуск
Требования
Python 3.13+
Node.js 18+
SQLite (встроен в Python)
Ollama (для AI-функций)
Obsidian с установленным Local REST API плагином

Для синхронизации с обсидиан подключить сторонний плагин Local REST API with MCP. Выбрать папку хранилище из репозитория HAC (прям из проекта) -- обсидиан подключен!
В соответствии с нюансами каждого устройства, может потребоваться установление сертификата безопастности для успешной передачи заметок в обсидиан. 
Для успешной работы обсидиан обязан работать фоново

Для подключения ИИ агента достаточно лишь загрузить Ollama.

ожидаемый вывод в консоле при правильном запуске: PS C:\Users\ar151\Downloads\last reles\DeKs> cd client
PS C:\Users\ar151\Downloads\last reles\DeKs\client> npm run dev -- --port 3000

> client@0.0.0 dev
> vite --port 3000


  VITE v5.4.21  ready in 365 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
(Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned) ; (& "c:\Users\ar151\Downloads\last reles\DeKs\.venv\Scripts\Activate.ps1")

Вторая (для клиент и сервера консоли различные)
PS C:\Users\ar151\Downloads\last reles\DeKs> cd server
PS C:\Users\ar151\Downloads\last reles\DeKs\server> (Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned) ; (& "c:\Users\ar151\Downloads\last reles\DeKs\.venv\Scripts\Activate.ps1")
(.venv) PS C:\Users\ar151\Downloads\last reles\DeKs\server> uvicorn main:app --host 127.0.0.1 --port 5174 --reload
INFO:     Will watch for changes in these directories: ['C:\\Users\\ar151\\Downloads\\last reles\\DeKs\\server']
INFO:     Uvicorn running on http://127.0.0.1:5174 (Press CTRL+C to quit)
INFO:     Started reloader process [3000] using WatchFiles
INFO:     Started server process [17508]
INFO:     Waiting for application startup.
INFO:main:Database connected
INFO:     Application startup complete.
INFO:watchfiles.main:3 changes detected
INFO:main:GET /api/messenger/unread
INFO:     127.0.0.1:61304 - "GET /api/messenger/unread?userId=10 HTTP/1.1" 200 OK
INFO:watchfiles.main:2 changes detected