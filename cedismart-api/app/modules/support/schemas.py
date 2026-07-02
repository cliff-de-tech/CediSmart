from pydantic import BaseModel, Field

class ChatMessage(BaseModel):
    role: str = Field(..., description="Either 'user' or 'model'")
    content: str = Field(..., min_length=1)

class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    support_type: str | None = Field(default="general", description="The support category context: 'auth' or 'general'")
    device_diagnostics: dict | None = Field(default=None, description="Optional metadata about client device")
    user_name: str | None = Field(default=None, description="Optional user name for personalization")

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


class FeedbackRequest(BaseModel):
    feedback_type: str = Field(..., min_length=2, max_length=50)  # e.g., "feature_request", "suggestion", "other"
    description: str = Field(..., min_length=5, max_length=2000)
    device_info: dict[str, str] | None = None


class FeedbackResponse(BaseModel):
    status: str
    message: str

