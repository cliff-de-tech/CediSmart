from pydantic import BaseModel, Field

class ChatMessage(BaseModel):
    role: str = Field(..., description="Either 'user' or 'model'")
    content: str = Field(..., min_length=1)

class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    device_diagnostics: dict | None = Field(default=None, description="Optional metadata about client device")

class ChatResponse(BaseModel):
    response: str

class EscalateRequest(BaseModel):
    phone: str
    user_query: str
    chat_history: list[ChatMessage]
    device_diagnostics: dict | None = Field(default=None, description="Client device diagnostic log metadata")

class EscalateResponse(BaseModel):
    ticket_id: str
    issue_number: int
    issue_url: str
    message: str
