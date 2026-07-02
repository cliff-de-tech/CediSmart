from typing import Annotated
from fastapi import APIRouter, Depends, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.modules.support.schemas import ChatRequest, ChatResponse, EscalateRequest, EscalateResponse, FeedbackRequest, FeedbackResponse
from app.modules.support.service import SupportService
from app.modules.auth.router import limiter

router = APIRouter()
DBSession = Annotated[AsyncSession, Depends(get_db)]

@router.post(
    "/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Get response from CediSmart AI Support Assistant",
)
@limiter.limit("30/15minutes")
async def chat_with_support(request: Request, body: ChatRequest) -> ChatResponse:
    """Generate a response using Gemini based on the conversation history."""
    response_text = await SupportService.generate_chat_response(
        body.messages, 
        support_type=body.support_type, 
        user_name=body.user_name
    )
    return ChatResponse(response=response_text)

@router.post(
    "/escalate",
    response_model=EscalateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Escalate issue to developer by opening a support ticket",
)
@limiter.limit("10/15minutes")
async def escalate_support_issue(request: Request, body: EscalateRequest, db: DBSession) -> EscalateResponse:
    """Save ticket locally, escalate to GitHub, and alert Discord webhook."""
    res = await SupportService.escalate_ticket(
        db=db,
        phone=body.phone,
        user_query=body.user_query,
        chat_history=body.chat_history,
        device_diagnostics=body.device_diagnostics
    )
    return EscalateResponse(
        ticket_id=res["ticket_id"],
        issue_number=res["issue_number"],
        issue_url=res["issue_url"],
        message="Support ticket successfully created and logged."
    )

@router.post(
    "/feedback",
    response_model=FeedbackResponse,
    status_code=status.HTTP_200_OK,
    summary="Submit user feedback and feature requests to Discord",
)
async def submit_feedback(
    body: FeedbackRequest,
    user_id: CurrentUser,
    db: DBSession
) -> FeedbackResponse:
    """Resolve current user, format and forward feedback to Discord channel."""
    # Find user
    from app.modules.auth.models import User
    from sqlalchemy import select
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return FeedbackResponse(status="error", message="User not found")

    await SupportService.submit_user_feedback(
        user_phone=user.phone,
        user_name=user.full_name or "N/A",
        feedback_type=body.feedback_type,
        description=body.description,
        device_info=body.device_info
    )
    
    return FeedbackResponse(
        status="submitted",
        message="Chale, thank you! Your feedback has been sent directly to the development team."
    )
