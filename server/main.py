import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
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
from security import (
    COOKIE_NAME,
    SERVER_ERROR,
    cookie_settings,
    create_session,
    delete_session,
    hash_password,
    password_matches,
    require_user,
    upgrade_password_if_needed,
)
from user_utils import serialize_colleague, serialize_user_self

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

def _client_origins() -> list[str]:
    raw = os.getenv("CLIENT_ORIGIN", "").strip()
    if not raw:
        raw = "http://localhost:5173,http://127.0.0.1:5173"
    return [item.strip() for item in raw.split(",") if item.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_client_origins(),
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
                (full_name, email, hash_password(password)),
            )
            conn.commit()

        logger.info("User registered: %s", email)
        return {"success": True, "message": "Регистрация успешна"}
    except Exception:
        logger.exception("Registration error")
        raise HTTPException(status_code=500, detail=SERVER_ERROR)


@app.post("/api/login")
def login(body: LoginRequest, response: Response):
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

        if not user or not password_matches(user["password"], password):
            return {"success": False, "message": "Неверная почта или пароль"}

        upgrade_password_if_needed(user["id"], user["password"], password)
        token = create_session(user["id"])
        response.set_cookie(value=token, **cookie_settings())
        logger.info("Login success: %s", email)
        return {
            "success": True,
            "message": "Добро пожаловать!",
            "user": serialize_user_self(user),
        }
    except Exception:
        logger.exception("Login error")
        raise HTTPException(status_code=500, detail=SERVER_ERROR)


@app.post("/api/logout")
def logout(request: Request, response: Response):
    delete_session(request.cookies.get(COOKIE_NAME))
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"success": True}


@app.get("/api/me")
def me(request: Request):
    user = require_user(request)
    return {"success": True, "user": serialize_user_self(user)}


@app.get("/api/colleagues")
def colleagues(request: Request):
    user = require_user(request)
    try:
        init_db()
        with get_connection() as conn:
            rows = conn.execute(
                """
                SELECT id, fullName, avatarUrl, position
                FROM users
                WHERE id != ?
                ORDER BY fullName COLLATE NOCASE ASC
                """,
                (user["id"],),
            ).fetchall()
        return {"success": True, "users": [serialize_colleague(row) for row in rows]}
    except Exception:
        logger.exception("Colleagues list error")
        raise HTTPException(status_code=500, detail=SERVER_ERROR)


@app.get("/api/colleagues/{user_id}")
def colleague(user_id: int, request: Request):
    require_user(request)
    init_db()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, fullName, avatarUrl, position FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Коллега не найден")
    return {"success": True, "user": serialize_colleague(row)}


@app.post("/api/chat")
async def chat(body: ChatRequest):
    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Сообщение пустое")

    try:
        response = await send_message(message)
        return {"success": True, "response": response}
    except Exception:
        logger.exception("AI chat error")
        return {"success": False, "message": SERVER_ERROR}
