from pydantic import BaseModel, Field

class ChatMessage(BaseModel):
    role: str = Field(..., description="Either 'user' or 'model'")
    content: str = Field(..., min_length=1)

class ChatRequest(BaseModel):
    messages: list[ChatMessage]

class ChatResponse(BaseModel):
    response: str

class EscalateRequest(BaseModel):
    phone: str
    user_query: str
    chat_history: list[ChatMessage]

class EscalateResponse(BaseModel):
    issue_number: int
    issue_url: str
    message: str
