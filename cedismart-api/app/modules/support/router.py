from fastapi import APIRouter, Depends, status
from app.modules.support.schemas import ChatRequest, ChatResponse, EscalateRequest, EscalateResponse
from app.modules.support.service import SupportService

router = APIRouter()

@router.post(
    "/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Get response from CediSmart AI Support Assistant",
)
async def chat_with_support(body: ChatRequest) -> ChatResponse:
    """Generate a response using Gemini based on the conversation history."""
    response_text = await SupportService.generate_chat_response(body.messages)
    return ChatResponse(response=response_text)

@router.post(
    "/escalate",
    response_model=EscalateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Escalate issue to developer by opening a GitHub issue",
)
async def escalate_support_issue(body: EscalateRequest) -> EscalateResponse:
    """Escalate a complicated support issue directly to the developer's GitHub repo."""
    res = await SupportService.escalate_to_github(
        phone=body.phone,
        user_query=body.user_query,
        chat_history=body.chat_history
    )
    return EscalateResponse(
        issue_number=res["number"],
        issue_url=res["html_url"],
        message="Support ticket successfully created and assigned."
    )
