"""Validation contracts for collaborative reports."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


ResourceType = Literal["document", "canvas"]
Permission = Literal["viewer", "editor", "reviewer"]
ReviewStatus = Literal["approved", "changes_requested"]


class CollaborationBootstrap(BaseModel):
    initial_state: str = Field(..., min_length=1, max_length=48_000_000)


class CollaborationCheckpoint(BaseModel):
    state: str = Field(..., min_length=1, max_length=48_000_000)
    content: dict = Field(...)
    through_seq: int = Field(..., ge=0)
    generation: int = Field(..., ge=1)
    create_revision: bool = False
    revision_reason: Literal["checkpoint", "manual", "review"] = "checkpoint"


class CollaboratorUpdate(BaseModel):
    permission: Permission


class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=12_000)
    anchor: str | None = Field(default=None, max_length=8_000)


class ReviewRequest(BaseModel):
    revision_id: str = Field(..., min_length=36, max_length=36)
    reviewer_ids: list[str] = Field(..., min_length=1, max_length=50)


class ReviewResponse(BaseModel):
    status: ReviewStatus
    note: str | None = Field(default=None, max_length=12_000)


class RevisionSummary(BaseModel):
    id: str
    revision_number: int
    title: str
    status: str | None
    sha256: str
    reason: str
    created_by_id: str
    created_by: str
    created_at: datetime

