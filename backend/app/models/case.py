"""案例数据模型"""

from tortoise import fields
from tortoise.models import Model


class Case(Model):
    id = fields.UUIDField(pk=True)
    title = fields.CharField(max_length=500)
    case_number = fields.CharField(max_length=100, unique=True, null=True)
    court = fields.CharField(max_length=200, null=True)
    case_type = fields.CharField(max_length=50, null=True)
    judgment_date = fields.DateField(null=True)
    summary = fields.TextField(null=True)
    content = fields.TextField(null=True)
    laws = fields.JSONField(null=True)  # PostgreSQL 数组用 JSON 存储
    case_tags = fields.JSONField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "cases"

    def to_dict(self):
        return {
            "id": str(self.id),
            "title": self.title,
            "case_number": self.case_number,
            "court": self.court,
            "case_type": self.case_type,
            "judgment_date": self.judgment_date.isoformat()
            if self.judgment_date
            else None,
            "summary": self.summary,
            "content": self.content,
            "laws": self.laws,
            "case_tags": self.case_tags,
        }
