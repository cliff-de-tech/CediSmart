from typing import Any

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
    device_diagnostics: dict[str, Any] | None = Field(
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
    language: str = Field(
        default="en",
        description="User dialect/language preference: 'en' (English), 'pidgin' (Ghanaian Pidgin), 'twi' (Twi / Akan)",
    )
    auto_pilot: bool = Field(
        default=False,
        description="Whether autonomous execution mode is active (executes transactions directly instead of proposing confirmation cards)",
    )
    deep_audit: bool = Field(
        default=False,
        description="Whether deep financial audit analysis is requested",
    )


class ChatResponse(BaseModel):
    response: str


class EscalateRequest(BaseModel):
    phone: str
    user_query: str
    chat_history: list[ChatMessage]
    device_diagnostics: dict[str, Any] | None = Field(
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


class VoiceActionPayload(BaseModel):
    amount: float | None = None
    type: str | None = None  # 'expense' or 'income'
    category: str | None = None
    description: str | None = None
    account_type: str | None = None  # 'mobile_money', 'cash', 'bank'
    screen: str | None = None


class VoiceAction(BaseModel):
    type: str  # 'create_transaction', 'check_balance', 'navigate', 'general_reply'
    payload: VoiceActionPayload | None = None


class VoiceRequest(BaseModel):
    audio_base64: str = Field(..., description="Base64-encoded audio recorded by client")
    audio_mime_type: str = Field(
        default="audio/m4a",
        description="MIME type of the audio (e.g. audio/m4a, audio/mp4, audio/wav, audio/aac)",
    )
    user_name: str | None = None
    phone: str | None = None
    initial_context: str | None = "dashboard"
    synthesize_audio: bool = True
    messages: list[dict[str, str]] | None = None
    language: str = Field(
        default="en",
        description="User dialect/language preference: 'en', 'pidgin', 'twi'",
    )
    auto_pilot: bool = Field(
        default=False,
        description="Whether autonomous execution mode is active",
    )
    deep_audit: bool = Field(
        default=False,
        description="Whether deep financial audit analysis is requested",
    )


class VoiceResponse(BaseModel):
    error_code: str | None = None
    transcript: str = Field(..., description="Transcribed user speech")
    response: str = Field(..., description="Spoken AI reply")
    action: VoiceAction | None = None
    audio_base64: str | None = Field(
        default=None,
        description="High-fidelity neural audio bytes (e.g. WAV) synthesized by Gemini for natural speech",
    )
    audio_mime_type: str | None = Field(
        default="audio/wav", description="MIME type of synthesized audio"
    )


class VoiceSynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)
    voice_name: str = Field(default="Kore")


class VoiceSynthesizeResponse(BaseModel):
    audio_base64: str | None = None
    audio_mime_type: str | None = "audio/wav"
