"""下载 embedding 模型到 backend/models，供离线运行使用。"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# 国内网络默认走镜像，可通过环境变量覆盖
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

from sentence_transformers import SentenceTransformer

from app.config import settings


def main() -> None:
    model_name = settings.EMBEDDING_MODEL
    target_dir = Path(__file__).resolve().parents[2] / "models" / model_name.split("/")[-1]
    target_dir.mkdir(parents=True, exist_ok=True)

    print(f"正在下载 {model_name} ...")
    model = SentenceTransformer(model_name)
    model.save(str(target_dir))
    print(f"模型已保存到 {target_dir}")


if __name__ == "__main__":
    main()
