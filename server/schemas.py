from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    fullName: str = Field(min_length=1)
    email: str = Field(min_length=3)
    password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)


class PrivateRoomRequest(BaseModel):
    userId: int = Field(ge=1)
    targetUserId: int = Field(ge=1)


class SendMessageRequest(BaseModel):
    userId: int = Field(ge=1)
    content: str = Field(min_length=1)


class ProfileUpdateRequest(BaseModel):
    position: str = ""
    birthDate: str | None = None


class ParseRequest(BaseModel):
    url: str = Field(min_length=3)
    mode: str = "auto"


class SyncRequest(BaseModel):
    force: bool = False


class RagChatRequest(BaseModel):
    message: str = Field(min_length=1)
