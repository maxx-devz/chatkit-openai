"""The same validated configuration drives preview and live conversations."""
from pydantic import BaseModel, ConfigDict, Field, field_validator


class AssistantConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    instructions: str = Field(default="", max_length=12000)
    knowledge: str = Field(default="", max_length=16000)
    vectorStoreId: str = Field(default="", max_length=200, pattern=r"^(vs_[A-Za-z0-9_-]+)?$")
    fileSearch: bool = True
    documents: bool = False
    images: bool = False
    documentLimit: int = Field(default=50, ge=1, le=500)
    imageLimit: int = Field(default=10, ge=1, le=500)
    greeting: str = Field(default="What can we work on today?", min_length=1, max_length=160)
    accent: str = Field(default="#1765ca", pattern=r"^#[0-9a-fA-F]{6}$")
    starters: list[str] = Field(default_factory=list, max_length=3)

    @field_validator("starters")
    @classmethod
    def starter_lengths(cls, value):
        if any(len(item) > 200 for item in value):
            raise ValueError("Starter prompt is too long")
        return value


async def load_config(db, client):
    # Before the additive builder migration, the existing assistant still works.
    cursor = await db.execute("SELECT to_regclass('portal_assistant_configs') AS name")
    if not (await cursor.fetchone())["name"]:
        value = {}
    else:
        cursor = await db.execute("SELECT published FROM portal_assistant_configs WHERE client_id=%s", (client["id"],))
        row = await cursor.fetchone()
        value = dict(row["published"] or {}) if row else {}
    value.update(instructions=client.get("assistant_instructions") or "",
                 vectorStoreId=client.get("openai_vector_store_id") or "")
    return AssistantConfig.model_validate(value).model_dump()
