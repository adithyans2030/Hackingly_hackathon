"""Thin LLM client (Anthropic API or AWS Bedrock). Optional.

Contract: callers ask for JSON, we strip fences and parse. Any failure returns None and
the pipeline continues on its deterministic path. The LLM never decides eligibility.
"""
from __future__ import annotations

import base64
import json
import logging
import re

from app.config import settings

log = logging.getLogger(__name__)


def enabled() -> bool:
    if settings.llm_provider == "anthropic":
        return bool(settings.anthropic_api_key)
    return settings.llm_provider == "bedrock"


def _content(prompt: str, images: list[tuple[bytes, str]] | None) -> list[dict]:
    parts: list[dict] = []
    for data, media_type in images or []:
        parts.append({"type": "image", "source": {"type": "base64", "media_type": media_type,
                                                  "data": base64.b64encode(data).decode()}})
    parts.append({"type": "text", "text": prompt})
    return parts


def _parse_json(text: str) -> dict | None:
    text = re.sub(r"```(?:json)?", "", text).strip()
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def complete_json(system: str, prompt: str, images: list[tuple[bytes, str]] | None = None,
                  max_tokens: int = 1024) -> dict | None:
    if not enabled():
        return None
    try:
        if settings.llm_provider == "anthropic":
            import requests

            r = requests.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": settings.anthropic_api_key,
                         "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": settings.anthropic_model, "max_tokens": max_tokens, "system": system,
                      "messages": [{"role": "user", "content": _content(prompt, images)}]},
                timeout=60,
            )
            r.raise_for_status()
            text = "".join(b.get("text", "") for b in r.json().get("content", []))
        else:
            import boto3

            client = boto3.client("bedrock-runtime", region_name=settings.aws_region)
            body = {"anthropic_version": "bedrock-2023-05-31", "max_tokens": max_tokens,
                    "system": system, "messages": [{"role": "user", "content": _content(prompt, images)}]}
            resp = client.invoke_model(modelId=settings.bedrock_model_id, body=json.dumps(body))
            payload = json.loads(resp["body"].read())
            text = "".join(b.get("text", "") for b in payload.get("content", []))
        return _parse_json(text)
    except Exception as e:
        log.warning("LLM call failed, continuing without it: %s", e)
        return None
