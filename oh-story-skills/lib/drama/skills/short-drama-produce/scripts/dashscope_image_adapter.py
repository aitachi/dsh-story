#!/usr/bin/env python3
"""DashScope (阿里云百炼) 文生图适配器 — short-drama-produce 自定义 adapter。

契约:stdin 收 job JSON;把生成图片写入 job["output_root"];stdout 回
{"outputs":[{"target","source"}...],"provider_job_id":...}。
凭据解析顺序:DASHSCOPE_API_KEY > DASHSCOPE_KEY_EU_PROD 等进程环境 >
.ENV_FALLBACKS 列出的 .env 文件。纯 stdlib,国内直连无需代理。
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

MINIMUM_PYTHON = (3, 9)
if sys.version_info < MINIMUM_PYTHON:
    raise SystemExit("dashscope_image_adapter.py requires Python 3.9 or newer")

DEFAULT_BASE = "https://dashscope.aliyuncs.com/api/v1/services/aigc"
DEFAULT_MODEL = "qwen-image-2.0"
DEFAULT_TIMEOUT = 240

ENV_FALLBACKS = [
    r"C:\Users\ASUS\Desktop\A-deepblue\907harness\.dsh-home\.env",
]
KEY_NAMES = [
    "DASHSCOPE_API_KEY",
    "DASHSCOPE_KEY_EU_PROD",
    "DASHSCOPE_KEY_CN_PROD",
    "DASHSCOPE_KEY_TEST",
    "DASHSCOPE_KEY_DEV",
]

RATIO_SIZES = {
    "1:1": "1024x1024",
    "9:16": "768x1344",
    "16:9": "1344x768",
    "3:4": "960x1280",
    "4:3": "1280x960",
    "21:9": "1344x576",
    "adaptive": "1024x1024",
}


class AdapterFailure(RuntimeError):
    pass


def resolve_key() -> str:
    for name in KEY_NAMES:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    for env_path in ENV_FALLBACKS:
        try:
            for line in Path(env_path).read_text(encoding="utf-8").splitlines():
                name, sep, value = line.partition("=")
                if sep and name.strip() in KEY_NAMES and value.strip():
                    return value.strip()
        except OSError:
            continue
    raise AdapterFailure("no DashScope credential found (env or fallback .env)")


def resolve_size(parameters: dict) -> str:
    size = parameters.get("size")
    if isinstance(size, str) and "x" in size.lower():
        return size.lower()
    ratio = parameters.get("ratio")
    if isinstance(ratio, str) and ratio in RATIO_SIZES:
        return RATIO_SIZES[ratio]
    return "1024x1024"


def http_json(url: str, *, token: str, body: dict | None = None, timeout: int = 60) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url, data=data, method="POST" if data else "GET")
    request.add_header("Authorization", f"Bearer {token}")
    if data is not None:
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:2000]
        raise AdapterFailure(f"dashscope http {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise AdapterFailure(f"dashscope unreachable: {exc.reason}") from exc


def http_bytes(url: str, timeout: int = 120) -> bytes:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.read()
    except urllib.error.URLError as exc:
        raise AdapterFailure(f"image download failed: {exc}") from exc


def generate_one(token: str, base: str, model: str, prompt: str, size: str) -> bytes:
    body = {
        "model": model,
        "input": {"messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}]},
        "parameters": {"size": size.replace("x", "*"), "n": 1},
    }
    result = http_json(f"{base}/multimodal-generation/generation", token=token, body=body, timeout=DEFAULT_TIMEOUT)
    if isinstance(result.get("code"), str):
        raise AdapterFailure(f"dashscope error {result.get('code')}: {result.get('message', '')[:500]}")
    choices = (result.get("output") or {}).get("choices")
    if not isinstance(choices, list) or not choices:
        raise AdapterFailure(f"dashscope returned no choices: {json.dumps(result)[:500]}")
    content = (choices[0].get("message") or {}).get("content")
    url = None
    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict) and isinstance(part.get("image"), str):
                url = part["image"]
                break
    if url is None:
        raise AdapterFailure(f"dashscope choice has no image: {json.dumps(result)[:500]}")
    return http_bytes(url)


def main() -> int:
    try:
        job = json.load(sys.stdin.buffer)
    except Exception as exc:
        print(f"invalid job json: {exc}", file=sys.stderr)
        return 8
    try:
        output_root = Path(job["output_root"])
        if not output_root.is_absolute() or not output_root.is_dir() or output_root.is_symlink():
            print("output_root is invalid", file=sys.stderr)
            return 8
        token = resolve_key()
        base = os.environ.get("DASHSCOPE_BASE_URL", DEFAULT_BASE).rstrip("/")
        model = os.environ.get("DASHSCOPE_IMAGE_MODEL", DEFAULT_MODEL)
        size = resolve_size(job.get("parameters") or {})
        outputs = []
        started = time.monotonic()
        for index, target in enumerate(job["outputs"]):
            suffix = Path(target).suffix.lower() or ".png"
            payload = generate_one(token, base, model, job["prompt"], size)
            staged = output_root / f"output-{index}{suffix}"
            staged.write_bytes(payload)
            outputs.append({"target": target, "source": str(staged)})
        provider_job_id = f"dashscope-{model}-{int(started)}"
        json.dump({"outputs": outputs, "provider_job_id": provider_job_id}, sys.stdout)
        return 0
    except AdapterFailure as exc:
        print(f"adapter failure: {exc}", file=sys.stderr)
        return 7
    except Exception as exc:
        print(f"adapter crashed: {exc}", file=sys.stderr)
        return 9


if __name__ == "__main__":
    raise SystemExit(main())
