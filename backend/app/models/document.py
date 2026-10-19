"""文书数据模型"""

from tortoise import fields
from tortoise.models import Model


class GeneratedDocument(Model):
    id = fields.UUIDField(pk=True)
    user = fields.ForeignKeyField("models.User", related_name="documents")
    title = fields.CharField(max_length=200, null=True)
    document_type = fields.CharField(max_length=50, null=True)
    content = fields.TextField(null=True)
    params = fields.JSONField(null=True)
    doc_references = fields.JSONField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "generated_documents"
