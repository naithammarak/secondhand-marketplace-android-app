from pydantic import BaseModel

#รับtoken จากgg
class GoogleLoginRequest(BaseModel):
    token: str