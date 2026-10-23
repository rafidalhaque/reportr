"""Attachment storage over the S3 API (AWS S3 by default, MinIO/R2/Spaces via config).

Credentials come from S3_ACCESS_KEY / S3_SECRET_KEY. With S3_ENDPOINT empty the botocore
defaults are used (real AWS S3, virtual-host addressing); a custom endpoint switches to
path-style addressing for S3-compatible services. Storage is disabled (the API layer
returns 503) when no keys are configured.
"""

import re
import uuid

import boto3
from botocore.config import Config as BotoConfig

from app.config import get_settings


class Storage:
    def __init__(
        self, endpoint: str, region: str, access_key: str, secret_key: str, bucket: str
    ):
        options = dict(
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
            config=BotoConfig(signature_version="s3v4"),
        )
        if endpoint:
            # S3-compatible services (MinIO, R2, Spaces) need path-style addressing
            options["endpoint_url"] = endpoint
            options["config"] = BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"})
        self._client = boto3.client("s3", **options)
        self.bucket = bucket

    @staticmethod
    def sanitize_filename(name: str) -> str:
        name = re.sub(r"[^A-Za-z0-9._-]", "_", name).strip("._") or "file"
        return name[:120]

    def object_key(self, filename: str) -> str:
        return f"attachments/{uuid.uuid4().hex}/{self.sanitize_filename(filename)}"

    def _put(self, key: str, data: bytes, content_type: str) -> None:
        self._client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        import anyio

        await anyio.to_thread.run_sync(self._put, key, data, content_type)

    def _presign(self, key: str) -> str:
        return self._client.generate_presigned_url(
            "get_object", Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=3600
        )

    async def presigned_get(self, key: str) -> str:
        import anyio

        return await anyio.to_thread.run_sync(self._presign, key)

    async def presign_attachments(self, attachments: list[dict]) -> list[dict]:
        out = []
        for att in attachments or []:
            entry = dict(att)
            try:
                entry["url"] = await self.presigned_get(att["key"])
            except Exception:
                entry["url"] = None
            out.append(entry)
        return out


def get_storage() -> Storage | None:
    s = get_settings()
    if not (s.s3_access_key and s.s3_secret_key and s.s3_bucket):
        return None
    return Storage(s.s3_endpoint, s.s3_region, s.s3_access_key, s.s3_secret_key, s.s3_bucket)
