from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(..., description="Either 'user' or 'model'")
    content: str = Field(..., min_length=1)
    image_base64: str | None = Field(
        default=None,
        description="Optional base64-encoded screenshot or receipt image attached to this message",
    )
    image_mime_type: str | None = Field(
        default="image/jpeg",
        description="MIME type of the attached image (e.g. image/jpeg, image/png)",
    )


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    support_type: str | None = Field(
        default="general",
        description="The support category context: 'auth' or 'general'",
    )
    device_diagnostics: dict | None = Field(
        default=None,
        description="Optional metadata about client device and X-Ray telemetry",
    )
    user_name: str | None = Field(
        default=None,
        description="Optional user name for personalization",
    )
    phone: str | None = Field(
        default=None,
        description="Optional user phone number for live DB X-Ray telemetry and instant MoMo SMS rescue",
    )
    image_base64: str | None = Field(
        default=None,
        description="Optional base64-encoded screenshot or receipt image attached to the latest turn",
    )
    image_mime_type: str | None = Field(
        default="image/jpeg",
        description="MIME type of the attached image",
    )


class ChatResponse(BaseModel):
    response: str


class EscalateRequest(BaseModel):
    phone: str
    user_query: str
    chat_history: list[ChatMessage]
    device_diagnostics: dict | None = Field(
        default=None,
        description="Client device diagnostic log metadata",
    )


class EscalateResponse(BaseModel):
    ticket_id: str
    issue_number: int
    issue_url: str
    message: str


class FeedbackRequest(BaseModel):
    feedback_type: str = Field(..., min_length=2, max_length=50)
    description: str = Field(..., min_length=5, max_length=2000)
    device_info: dict[str, str] | None = None


class FeedbackResponse(BaseModel):
    status: str
    message: str
    issue_number: int | None = None
    issue_url: str | None = None


class TicketStatusResponse(BaseModel):
    issue_number: int
    state: str
    title: str
    issue_url: str
    labels: list[str] = Field(default_factory=list)
    pr_url: str | None = None
    pr_state: str | None = None
    latest_agent_comment: str | None = None
    user_status: str = Field(default="received")
    status_label: str = Field(default="Report Received")
    status_description: str = Field(default="Your report and diagnostic data have been received.")
    stage_step: int = Field(default=1)
