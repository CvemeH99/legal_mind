"""聊天数据模型"""

from tortoise import fields
from tortoise.models import Model


class ChatSession(Model):
    id = fields.IntField(pk=True)
    user = fields.ForeignKeyField(
        "models.User", related_name="chat_sessions", on_delete=fields.CASCADE
    )
    session_id = fields.CharField(max_length=100, unique=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "chat_sessions"


class ChatMessageRecord(Model):
    id = fields.IntField(pk=True)
    chat_session = fields.ForeignKeyField(
        "models.ChatSession", related_name="messages", on_delete=fields.CASCADE
    )
    role = fields.CharField(max_length=20)
    content = fields.TextField()
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "chat_messages"
