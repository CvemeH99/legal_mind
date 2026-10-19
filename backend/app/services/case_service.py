"""案例服务"""

from typing import Optional, Dict, List
from app.models.case import Case


class CaseService:
    """案例服务"""

    async def get_by_id(self, case_id: str) -> Optional[Dict]:
        case = await Case.get_or_none(id=case_id)
        if case:
            return case.to_dict()
        return None

    async def search(
        self,
        query: str,
        case_type: Optional[str] = None,
        court: Optional[str] = None,
        limit: int = 10,
    ) -> List[Dict]:
        qs = Case.all()
        if case_type:
            qs = qs.filter(case_type=case_type)
        if court:
            qs = qs.filter(court=court)
        cases = await qs.limit(limit)
        return [case.to_dict() for case in cases]
