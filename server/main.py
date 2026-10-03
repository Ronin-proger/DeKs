import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from chat import send_message
from database import get_connection, init_db
from intelligence.router import router as intelligence_router
from obsidian_router import router as obsidian_router
from messenger import router as messenger_router
from parser import router as parser_router
from workspace import router as workspace_router
from profile import router as profile_router
from schemas import ChatRequest, LoginRequest, RegisterRequest
from user_utils import serialize_user_public

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
(UPLOADS_DIR / "chat").mkdir(exist_ok=True)
(UPLOADS_DIR / "avatars").mkdir(exist_ok=True)
(UPLOADS_DIR / "workspace").mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    logger.info("Database connected")
    yield


app = FastAPI(
    title="Corporate Analytics API",
    description="Backend for corporate analytics portal",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(messenger_router)
app.include_router(workspace_router)
app.include_router(profile_router)
app.include_router(parser_router)
app.include_router(intelligence_router)
app.include_router(obsidian_router)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


@app.middleware("http")
async def log_requests(request, call_next):
    logger.info("%s %s", request.method, request.url.path)
    response = await call_next(request)
    return response


@app.get("/")
def root():
    return {"success": True, "message": "Сервер работает"}


@app.post("/api/register")
def register(body: RegisterRequest):
    full_name = body.fullName.strip()
    email = body.email.strip()
    password = body.password.strip()

    if not full_name or not email or not password:
        raise HTTPException(status_code=400, detail="Все поля обязательны")

    if len(password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Пароль должен быть минимум 6 символов",
        )

    try:
        init_db()
        with get_connection() as conn:
            existing = conn.execute(
                "SELECT id FROM users WHERE email = ?",
                (email,),
            ).fetchone()

            if existing:
                return {"success": False, "message": "Такой пользователь уже существует"}

            conn.execute(
                "INSERT INTO users (fullName, email, password) VALUES (?, ?, ?)",
                (full_name, email, password),
            )
            conn.commit()

        logger.info("User registered: %s", email)
        return {"success": True, "message": "Регистрация успешна"}
    except Exception as exc:
        logger.exception("Registration error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/check-login")
def check_login(body: LoginRequest):
    email = body.email.strip()
    password = body.password.strip()

    if not email or not password:
        return {"success": False, "message": "Введите email и пароль"}

    try:
        with get_connection() as conn:
            user = conn.execute(
                "SELECT * FROM users WHERE email = ?",
                (email,),
            ).fetchone()

        if not user:
            return {"success": False, "message": "Пользователь не найден"}

        if user["password"] != password:
            return {"success": False, "message": "Неверный пароль"}

        logger.info("Login success: %s", email)
        return {
            "success": True,
            "message": "Добро пожаловать!",
            "user": serialize_user_public(user),
        }
    except Exception as exc:
        logger.exception("Login error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/users")
def get_users():
    try:
        init_db()
        with get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM users ORDER BY id DESC"
            ).fetchall()

        users = [serialize_user_public(row) for row in rows]
        return {"success": True, "users": users}
    except Exception as exc:
        logger.exception("Users list error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/chat")
async def chat(body: ChatRequest):
    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Сообщение пустое")

    try:
        response = await send_message(message)
        return {"success": True, "response": response}
    except Exception as exc:
        logger.exception("AI chat error")
        return {"success": False, "error": str(exc), "message": str(exc)}
