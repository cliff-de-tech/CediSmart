from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.core.exceptions import AppException
from app.core.security import decode_token
from app.modules.auth.router import limiter
from app.modules.support.schemas import (
    ChatRequest,
    ChatResponse,
    EscalateRequest,
    EscalateResponse,
    FeedbackRequest,
    FeedbackResponse,
    TicketStatusResponse,
    VoiceRequest,
    VoiceResponse,
    VoiceSynthesizeRequest,
    VoiceSynthesizeResponse,
)
from app.modules.support.service import SupportService

router = APIRouter()
DBSession = Annotated[AsyncSession, Depends(get_db)]


@router.post(
    "/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Get response from CediSmart AI Support Assistant",
)
@limiter.limit("30/15minutes")
async def chat_with_support(request: Request, body: ChatRequest, db: DBSession) -> ChatResponse:
    (
        "Generate a response using Gemini (with ChatGPT fallback), live X-Ray telemetry, SMS "
        "paste rescue, and "
        "vision."
    )
    extra_kwargs: dict[str, Any] = {}
    if body.phone is not None:
        extra_kwargs["phone"] = body.phone
    if body.device_diagnostics is not None:
        extra_kwargs["device_diagnostics"] = body.device_diagnostics
    if body.image_base64 is not None:
        extra_kwargs["image_base64"] = body.image_base64
        extra_kwargs["image_mime_type"] = body.image_mime_type
    if body.phone or body.device_diagnostics:
        extra_kwargs["db"] = db

    response_text = await SupportService.generate_chat_response(
        body.messages,
        support_type=body.support_type,
        user_name=body.user_name,
        language=body.language,
        voice_persona=body.voice_persona,
        auto_pilot=body.auto_pilot,
        deep_audit=body.deep_audit,
        **extra_kwargs,
    )
    return ChatResponse(response=response_text)


@router.post(
    "/voice",
    response_model=VoiceResponse,
    status_code=status.HTTP_200_OK,
    summary="Process spoken user audio with Gemini multimodal audio understanding",
)
@limiter.limit("60/15minutes")
async def voice_chat_with_support(
    request: Request, body: VoiceRequest, db: DBSession
) -> VoiceResponse:
    """Transcribes spoken user audio and returns a natural spoken response + detected action."""
    user_id: UUID | None = None
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        try:
            payload = decode_token(token)
            if payload.get("type") == "access":
                sub = payload.get("sub")
                if sub:
                    user_id = UUID(str(sub))
        except Exception:
            pass

    result = await SupportService.process_voice(
        audio_base64=body.audio_base64,
        audio_mime_type=body.audio_mime_type,
        user_name=body.user_name,
        phone=body.phone,
        initial_context=body.initial_context,
        synthesize_audio=body.synthesize_audio,
        messages=body.messages,
        language=body.language,
        voice_persona=body.voice_persona,
        auto_pilot=body.auto_pilot,
        deep_audit=body.deep_audit,
        db=db,
        user_id=user_id,
    )
    return VoiceResponse(**result)


@router.post(
    "/voice/synthesize",
    response_model=VoiceSynthesizeResponse,
    status_code=status.HTTP_200_OK,
    summary="Synthesize text to high-fidelity natural neural speech via Gemini TTS",
)
@limiter.limit("60/15minutes")
async def synthesize_voice(
    request: Request, body: VoiceSynthesizeRequest
) -> VoiceSynthesizeResponse:
    """Returns base64 audio bytes for natural sounding spoken playback."""
    audio_b64, mime = await SupportService.synthesize_neural_voice(
        text=body.text,
        voice_name=body.voice_name,
        voice_persona=body.voice_persona,
    )
    if not audio_b64:
        raise AppException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error_code="synthesis_unavailable",
            message="Natural voice is unavailable. Please retry.",
        )
    return VoiceSynthesizeResponse(audio_base64=audio_b64, audio_mime_type=mime or "audio/wav")


@router.post(
    "/escalate",
    response_model=EscalateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Escalate issue to developer by opening a support ticket",
)
@limiter.limit("10/15minutes")
async def escalate_support_issue(
    request: Request, body: EscalateRequest, db: DBSession
) -> EscalateResponse:
    (
        "Save ticket locally, escalate to GitHub (triggering ChatGPT Code Agent), and alert "
        "Discord webhook."
    )
    res = await SupportService.escalate_ticket(
        db=db,
        phone=body.phone,
        user_query=body.user_query,
        chat_history=body.chat_history,
        device_diagnostics=body.device_diagnostics,
    )
    return EscalateResponse(
        ticket_id=res["ticket_id"],
        issue_number=res["issue_number"],
        issue_url=res["issue_url"],
        message="Support ticket successfully created and logged.",
    )


@router.get(
    "/ticket-status/{issue_number}",
    response_model=TicketStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Check live GitHub Issue and Autonomous ChatGPT PR status for an escalated ticket",
)
async def get_support_ticket_status(issue_number: int) -> TicketStatusResponse:
    """Return live GitHub issue state, PR URL, and latest ChatGPT Code Agent comment."""
    status_data = await SupportService.get_ticket_status(issue_number=issue_number)
    return TicketStatusResponse(**status_data)


@router.post(
    "/feedback",
    response_model=FeedbackResponse,
    status_code=status.HTTP_200_OK,
    summary="Submit user feedback and feature requests to GitHub & Discord",
)
async def submit_feedback(
    body: FeedbackRequest,
    user_id: CurrentUser,
    db: DBSession,
) -> FeedbackResponse:
    (
        "Resolve current user, open a GitHub issue for the ChatGPT Code Agent, and forward to "
        "Discord."
    )
    from sqlalchemy import select

    from app.modules.auth.models import User

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return FeedbackResponse(status="error", message="User not found")

    feedback_res = await SupportService.submit_user_feedback(
        user_phone=user.phone,
        user_name=user.full_name or "N/A",
        feedback_type=body.feedback_type,
        description=body.description,
        device_info=body.device_info,
    )

    issue_number = feedback_res.get("issue_number") if isinstance(feedback_res, dict) else None
    issue_url = feedback_res.get("issue_url") if isinstance(feedback_res, dict) else None

    return FeedbackResponse(
        status="submitted",
        message="Chale, thank you! Your feedback has been sent directly to the development team.",
        issue_number=issue_number,
        issue_url=issue_url,
    )
