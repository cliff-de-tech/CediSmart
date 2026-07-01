from typing import Annotated
from fastapi import APIRouter, Depends, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.support.schemas import ChatRequest, ChatResponse, EscalateRequest, EscalateResponse
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
    response_text = await SupportService.generate_chat_response(body.messages)
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
