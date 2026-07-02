from pydantic import BaseModel, Field

class PaymentInitializeRequest(BaseModel):
    plan: str = Field(..., description="The subscription plan to purchase: 'pro' or 'business'")

class PaymentInitializeResponse(BaseModel):
    authorization_url: str = Field(..., description="The URL to redirect the user to for checkout")
    reference: str = Field(..., description="The unique transaction reference ID")
