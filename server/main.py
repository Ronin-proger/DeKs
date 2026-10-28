import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
    load_user,
    password_matches,
    require_user,
)
from user_utils import serialize_colleague, serialize_user_self

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
(UPLOADS_DIR / "chat").mkdir(exist_ok=True)
(UPLOADS_DIR / "avatars").mkdir(exist_ok=True)
(UPLOADS_DIR / "workspace").mkdir(exist_ok=True)

PUBLIC_PATHS = {
    "/",
    "/health",
    "/api/login",
    "/api/register",
    "/api/logout",
    "/docs",
    "/openapi.json",
    "/redoc",
}


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


# Local defaults are permissive; production should set CLIENT_ORIGIN and
# COOKIE_SECURE=true, and restrict methods/headers to what the client needs.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_client_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Webhook-Secret", "X-Hub-Signature-256"],
)

app.include_router(messenger_router)
app.include_router(workspace_router)
app.include_router(profile_router)
app.include_router(parser_router)
app.include_router(intelligence_router)
app.include_router(obsidian_router)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


@app.middleware("http")
async def auth_and_log(request: Request, call_next):
    path = request.url.path
    logger.info("%s %s", request.method, path)

    if request.method == "OPTIONS":
        return await call_next(request)

    if path in PUBLIC_PATHS or path == "/api/intelligence/webhook":
        return await call_next(request)

    if path.startswith("/uploads/") or (
        path.startswith("/api/") and path not in PUBLIC_PATHS
    ):
        # Route handlers still call require_user/require_self; this covers
        # StaticFiles under /uploads and any missed API route.
        if path.startswith("/uploads/") and load_user(request) is None:
            return JSONResponse({"detail": "Нужно войти"}, status_code=401)

    response = await call_next(request)
    return response


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"status": "ok", "service": "deks-api"}


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
        with get_connection() as conn:
            existing = conn.execute(
                "SELECT id FROM users WHERE email = ?",
                (email,),
            ).fetchone()

            if existing:
                raise HTTPException(status_code=409, detail="Такой пользователь уже существует")

            conn.execute(
                "INSERT INTO users (fullName, email, password) VALUES (?, ?, ?)",
                (full_name, email, hash_password(password)),
            )
            conn.commit()

        logger.info("User registered: %s", email)
        return {"success": True, "message": "Регистрация успешна"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Registration error")
        raise HTTPException(status_code=500, detail=SERVER_ERROR)


@app.post("/api/login")
def login(body: LoginRequest, response: Response):
    email = body.email.strip()
    password = body.password.strip()

    if not email or not password:
        raise HTTPException(status_code=400, detail="Введите email и пароль")

    try:
        with get_connection() as conn:
            user = conn.execute(
                "SELECT * FROM users WHERE email = ?",
                (email,),
            ).fetchone()

        if not user or not password_matches(user["password"], password):
            raise HTTPException(status_code=401, detail="Неверная почта или пароль")

        token = create_session(user["id"])
        response.set_cookie(value=token, **cookie_settings())
        logger.info("Login success: %s", email)
        return {
            "success": True,
            "message": "Добро пожаловать!",
            "user": serialize_user_self(user),
        }
    except HTTPException:
        raise
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
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, fullName, avatarUrl, position FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Коллега не найден")
    return {"success": True, "user": serialize_colleague(row)}


@app.post("/api/chat")
async def chat(body: ChatRequest, request: Request):
    require_user(request)
    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Сообщение пустое")

    try:
        response = await send_message(message)
        return {"success": True, "response": response}
    except Exception:
        logger.exception("AI chat error")
        raise HTTPException(status_code=500, detail=SERVER_ERROR)
