#!/usr/bin/env python3
"""CediSmart Autonomous ChatGPT (gpt-4o) Code Agent.

Runs inside GitHub Actions whenever a support ticket, bug report, or feature
request issue is opened (or when a developer comments `@chatgpt`).

Authentication:
- Uses `OPENAI_API_KEY` against `https://api.openai.com/v1/chat/completions` if provided.
- Otherwise uses GitHub's built-in `GITHUB_TOKEN` (with `permissions: models: read`)
  against GitHub Models (`https://models.inference.ai.azure.com/chat/completions`)
  at $0 cost with zero external API keys required.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import httpx

REPO_ROOT = Path(__file__).resolve().parents[2]
IGNORED_DIRS = {
    ".git",
    "node_modules",
    ".expo",
    "__pycache__",
    ".pytest_cache",
    ".venv",
    "venv",
    "dist",
    "build",
    "android",
    "ios",
}

SYSTEM_PROMPT = """You are the CediSmart Autonomous Principal Software Engineer (powered by ChatGPT gpt-4o).
You have full read and write access to the CediSmart monorepo:
- `cedismart-mobile/`: React Native (Expo SDK 57, TypeScript, NativeWind, React Query, Zustand, Liquid Glass UI components in `src/components/glass/`).
- `cedismart-api/`: FastAPI (Python 3.12, async SQLAlchemy 2.0, Pydantic v2, Redis, PostgreSQL) in `cedismart-api/app/modules/`.

Your mission:
1. Carefully read the GitHub Issue (support escalation, bug report, or feature request) and any developer comment.
2. Use `search_code`, `list_files`, and `read_file` to inspect the relevant mobile and/or backend files.
3. If the issue is a bug or feature request that can be resolved in code:
   - Make minimal, surgical, production-grade code edits using `replace_in_file` or `write_file`.
   - Preserve CediSmart's Liquid Glass design system (`GlassSurface`, `GlassButton`, `#4ade80` dark-mode accents) and FastAPI modular patterns.
   - Run `run_verification` (`mobile_tsc` and/or `backend_syntax`) to verify your changes compile cleanly with zero errors.
   - If verification reports any errors, fix them before finishing.
4. Provide a clear markdown summary containing:
   - **Root Cause / Requirement Analysis**
   - **Files Modified & Changes Made**
   - **Verification Results**
"""

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List files in a directory of the CediSmart repository.",
            "parameters": {
                "type": "object",
                "properties": {
                    "directory": {
                        "type": "string",
                        "description": "Relative directory path from repo root (e.g. 'cedismart-mobile/src' or 'cedismart-api/app').",
                    },
                    "max_depth": {
                        "type": "integer",
                        "description": "Maximum folder traversal depth (default 3).",
                    },
                },
                "required": ["directory"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_code",
            "description": "Search for a text or regex pattern across files in the repository.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search term or pattern to look for.",
                    },
                    "path": {
                        "type": "string",
                        "description": "Optional relative subdirectory to restrict the search (e.g. 'cedismart-mobile/src').",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read lines from a file in the repository with line numbers.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Relative path to the file from repo root.",
                    },
                    "start_line": {
                        "type": "integer",
                        "description": "1-indexed start line (default 1).",
                    },
                    "end_line": {
                        "type": "integer",
                        "description": "1-indexed end line (default 250).",
                    },
                },
                "required": ["file_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "replace_in_file",
            "description": "Replace an exact substring in an existing file with new content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Relative path to the file from repo root.",
                    },
                    "target_content": {
                        "type": "string",
                        "description": "Exact existing multi-line string in the file to replace.",
                    },
                    "replacement_content": {
                        "type": "string",
                        "description": "New content to replace target_content with.",
                    },
                },
                "required": ["file_path", "target_content", "replacement_content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Create or overwrite a file in the repository.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Relative path to the file from repo root.",
                    },
                    "content": {
                        "type": "string",
                        "description": "Complete file content to write.",
                    },
                },
                "required": ["file_path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_verification",
            "description": "Run TypeScript typechecking on cedismart-mobile or Python syntax verification on cedismart-api.",
            "parameters": {
                "type": "object",
                "properties": {
                    "target": {
                        "type": "string",
                        "enum": ["mobile_tsc", "backend_syntax", "both"],
                        "description": "Which verification suite to run.",
                    }
                },
                "required": ["target"],
            },
        },
    },
]


def _safe_path(rel_path: str) -> Path:
    target = (REPO_ROOT / rel_path.lstrip("/")).resolve()
    if not str(target).startswith(str(REPO_ROOT)):
        raise ValueError(f"Path '{rel_path}' escapes repository root.")
    return target


def tool_list_files(directory: str = ".", max_depth: int = 3) -> str:
    base = _safe_path(directory)
    if not base.exists():
        return f"Directory '{directory}' does not exist."
    results: list[str] = []
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in sorted(dirs) if d not in IGNORED_DIRS]
        rel_root = Path(root).relative_to(base)
        depth = 0 if str(rel_root) == "." else len(rel_root.parts)
        if depth > max_depth:
            dirs[:] = []
            continue
        for f in sorted(files):
            full_rel = (Path(root) / f).relative_to(REPO_ROOT)
            results.append(str(full_rel))
            if len(results) >= 300:
                results.append("... (truncated at 300 files)")
                return "\n".join(results)
    return "\n".join(results) if results else "No files found."


def tool_search_code(query: str, path: str = ".") -> str:
    search_dir = _safe_path(path)
    if not search_dir.exists():
        return f"Path '{path}' does not exist."
    cmd = [
        "grep",
        "-rnI",
        "--exclude-dir=.git",
        "--exclude-dir=node_modules",
        "--exclude-dir=.expo",
        "--exclude-dir=__pycache__",
        query,
        str(search_dir),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT)
    lines = proc.stdout.splitlines()
    if not lines:
        return f"No matches found for '{query}'."
    trimmed = []
    for line in lines[:80]:
        if line.startswith(str(REPO_ROOT)):
            line = line[len(str(REPO_ROOT)) + 1 :]
        trimmed.append(line)
    if len(lines) > 80:
        trimmed.append(f"... ({len(lines) - 80} more matches omitted)")
    return "\n".join(trimmed)


def tool_read_file(file_path: str, start_line: int = 1, end_line: int = 250) -> str:
    target = _safe_path(file_path)
    if not target.exists() or not target.is_file():
        return f"File '{file_path}' does not exist."
    lines = target.read_text(encoding="utf-8", errors="replace").splitlines()
    start = max(1, start_line)
    end = min(len(lines), max(start, end_line))
    numbered = [f"{i}: {lines[i - 1]}" for i in range(start, end + 1)]
    header = f"File: {file_path} (lines {start}-{end} of {len(lines)})"
    return header + "\n" + "\n".join(numbered)


def tool_replace_in_file(file_path: str, target_content: str, replacement_content: str) -> str:
    target = _safe_path(file_path)
    if not target.exists():
        return f"Error: File '{file_path}' does not exist."
    content = target.read_text(encoding="utf-8")
    if target_content not in content:
        return (
            f"Error: target_content was not found verbatim in '{file_path}'. "
            "Read the file first with read_file to verify exact whitespace and lines."
        )
    count = content.count(target_content)
    if count > 1:
        return f"Error: target_content appears {count} times in '{file_path}'. Include more surrounding context lines."
    updated = content.replace(target_content, replacement_content, 1)
    target.write_text(updated, encoding="utf-8")
    return f"Successfully updated '{file_path}'."


def tool_write_file(file_path: str, content: str) -> str:
    target = _safe_path(file_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return f"Successfully wrote '{file_path}' ({len(content)} bytes)."


def tool_run_verification(target: str = "both") -> str:
    outputs: list[str] = []
    if target in ("mobile_tsc", "both") and (REPO_ROOT / "cedismart-mobile").exists():
        proc = subprocess.run(
            ["npx", "tsc", "--noEmit"],
            cwd=REPO_ROOT / "cedismart-mobile",
            capture_output=True,
            text=True,
        )
        status = "PASSED" if proc.returncode == 0 else f"FAILED (exit {proc.returncode})"
        outputs.append(f"=== Mobile TypeScript Check ({status}) ===\n{(proc.stdout + proc.stderr).strip()[:3000]}")

    if target in ("backend_syntax", "both") and (REPO_ROOT / "cedismart-api").exists():
        proc = subprocess.run(
            [sys.executable, "-m", "compileall", "-q", "app"],
            cwd=REPO_ROOT / "cedismart-api",
            capture_output=True,
            text=True,
        )
        status = "PASSED" if proc.returncode == 0 else f"FAILED (exit {proc.returncode})"
        outputs.append(f"=== Backend Python Syntax Check ({status}) ===\n{(proc.stdout + proc.stderr).strip()[:3000]}")

    return "\n\n".join(outputs) if outputs else "No verification targets found."


def execute_tool(name: str, args: dict[str, Any]) -> str:
    try:
        if name == "list_files":
            return tool_list_files(args.get("directory", "."), int(args.get("max_depth", 3)))
        if name == "search_code":
            return tool_search_code(args["query"], args.get("path", "."))
        if name == "read_file":
            return tool_read_file(
                args["file_path"],
                int(args.get("start_line", 1)),
                int(args.get("end_line", 250)),
            )
        if name == "replace_in_file":
            return tool_replace_in_file(
                args["file_path"],
                args["target_content"],
                args["replacement_content"],
            )
        if name == "write_file":
            return tool_write_file(args["file_path"], args["content"])
        if name == "run_verification":
            return tool_run_verification(args.get("target", "both"))
        return f"Unknown tool '{name}'."
    except Exception as exc:
        return f"Tool execution error in '{name}': {exc}"


def call_chatgpt(messages: list[dict[str, Any]], openai_key: str, github_token: str) -> dict[str, Any]:
    """Call ChatGPT (`gpt-4o`) via OpenAI API if OPENAI_API_KEY is set, or free GitHub Models."""
    if openai_key:
        url = "https://api.openai.com/v1/chat/completions"
        token = openai_key
    else:
        url = "https://models.inference.ai.azure.com/chat/completions"
        token = github_token

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "gpt-4o",
        "messages": messages,
        "tools": TOOLS,
        "tool_choice": "auto",
        "temperature": 0.1,
    }
    with httpx.Client(timeout=90.0) as client:
        resp = client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        return resp.json()


def get_modified_files() -> list[str]:
    proc = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    files = []
    for line in proc.stdout.splitlines():
        if line.strip():
            files.append(line[3:].strip())
    return files


def create_pr_and_notify(
    issue_number: str,
    issue_title: str,
    summary_markdown: str,
    modified_files: list[str],
    github_repo: str,
    github_token: str,
    discord_webhook: str,
) -> None:
    branch_name = f"chatgpt/issue-{issue_number}"
    subprocess.run(["git", "config", "user.name", "CediSmart ChatGPT Agent"], cwd=REPO_ROOT, check=True)
    subprocess.run(
        ["git", "config", "user.email", "chatgpt-agent@cedismart.com"],
        cwd=REPO_ROOT,
        check=True,
    )
    subprocess.run(["git", "checkout", "-B", branch_name], cwd=REPO_ROOT, check=True)
    subprocess.run(["git", "add", "-A"], cwd=REPO_ROOT, check=True)
    commit_msg = f"fix(ai-agent): resolve #{issue_number} - {issue_title[:60]}"
    subprocess.run(["git", "commit", "-m", commit_msg], cwd=REPO_ROOT, check=True)
    subprocess.run(["git", "push", "-u", "origin", branch_name, "--force"], cwd=REPO_ROOT, check=True)

    headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github+json",
    }
    files_bullet = "\n".join(f"- `{f}`" for f in modified_files)
    pr_body = (
        f"## 🤖 CediSmart Autonomous ChatGPT (`gpt-4o`) Pull Request\n\n"
        f"Fixes #{issue_number}\n\n"
        f"### 📂 Modified Files\n{files_bullet}\n\n"
        f"### 🧠 Agent Analysis & Verification\n{summary_markdown}\n"
    )
    pr_url = ""
    with httpx.Client(timeout=30.0) as client:
        pr_resp = client.post(
            f"https://api.github.com/repos/{github_repo}/pulls",
            headers=headers,
            json={
                "title": f"🤖 [ChatGPT Auto-Fix] {issue_title[:75]} (#{issue_number})",
                "head": branch_name,
                "base": "main",
                "body": pr_body,
            },
        )
        if pr_resp.status_code in (200, 201):
            pr_url = pr_resp.json().get("html_url", "")
        else:
            # Check if PR already exists for this branch
            existing = client.get(
                f"https://api.github.com/repos/{github_repo}/pulls?head={github_repo.split('/')[0]}:{branch_name}",
                headers=headers,
            )
            if existing.status_code == 200 and existing.json():
                pr_url = existing.json()[0].get("html_url", "")

        comment_body = (
            f"### 🤖 ChatGPT (`gpt-4o`) Code Agent Completed!\n\n"
            f"I have analyzed this issue, implemented the code changes on branch `{branch_name}`, "
            f"and verified the build.\n\n"
            f"🔗 **Pull Request:** {pr_url or branch_name}\n\n"
            f"---\n{summary_markdown}"
        )
        client.post(
            f"https://api.github.com/repos/{github_repo}/issues/{issue_number}/comments",
            headers=headers,
            json={"body": comment_body},
        )

        if discord_webhook:
            client.post(
                discord_webhook,
                json={
                    "username": "CediSmart ChatGPT Engineer",
                    "embeds": [
                        {
                            "title": f"🤖 Pull Request Ready for Issue #{issue_number}",
                            "description": f"**{issue_title}**\n\nChatGPT (`gpt-4o`) has written a fix and opened a Pull Request for review.",
                            "color": 3066993,
                            "fields": [
                                {"name": "📂 Files Changed", "value": files_bullet[:1000] or "N/A", "inline": False},
                                {"name": "🔗 Pull Request", "value": pr_url or branch_name, "inline": False},
                            ],
                        }
                    ],
                },
            )


def post_issue_comment_only(
    issue_number: str,
    summary_markdown: str,
    github_repo: str,
    github_token: str,
) -> None:
    headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github+json",
    }
    with httpx.Client(timeout=30.0) as client:
        client.post(
            f"https://api.github.com/repos/{github_repo}/issues/{issue_number}/comments",
            headers=headers,
            json={
                "body": f"### 🤖 ChatGPT (`gpt-4o`) Diagnostic Report\n\n{summary_markdown}"
            },
        )


def main() -> None:
    github_token = os.environ.get("GITHUB_TOKEN", "")
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    discord_webhook = os.environ.get("DISCORD_WEBHOOK_URL", "")
    github_repo = os.environ.get("GITHUB_REPOSITORY", "cliff-de-tech/CediSmart")
    issue_number = os.environ.get("ISSUE_NUMBER", "")
    issue_title = os.environ.get("ISSUE_TITLE", "Support Issue")
    issue_body = os.environ.get("ISSUE_BODY", "")
    comment_body = os.environ.get("COMMENT_BODY", "")

    if not github_token and not openai_key:
        print("Error: Neither GITHUB_TOKEN nor OPENAI_API_KEY is set.", file=sys.stderr)
        sys.exit(1)

    user_prompt = (
        f"GitHub Issue #{issue_number}: {issue_title}\n\n"
        f"=== Issue Description ===\n{issue_body}\n"
    )
    if comment_body:
        user_prompt += f"\n=== Latest Developer / User Comment ===\n{comment_body}\n"

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    final_summary = "Analysis completed."
    for step in range(15):
        print(f"[ChatGPT Agent] Step {step + 1}/15...")
        resp_data = call_chatgpt(messages, openai_key, github_token)
        choice = resp_data["choices"][0]
        msg = choice["message"]
        messages.append(msg)

        tool_calls = msg.get("tool_calls") or []
        if not tool_calls:
            final_summary = msg.get("content") or final_summary
            break

        for tc in tool_calls:
            fn_name = tc["function"]["name"]
            raw_args = tc["function"].get("arguments") or "{}"
            try:
                parsed_args = json.loads(raw_args)
            except json.JSONDecodeError:
                parsed_args = {}
            print(f"  -> Calling tool: {fn_name}({list(parsed_args.keys())})")
            result_str = execute_tool(fn_name, parsed_args)
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "name": fn_name,
                    "content": result_str[:12000],
                }
            )

    modified = get_modified_files()
    if modified and issue_number:
        print(f"[ChatGPT Agent] Modified {len(modified)} file(s): {modified}")
        create_pr_and_notify(
            issue_number=issue_number,
            issue_title=issue_title,
            summary_markdown=final_summary,
            modified_files=modified,
            github_repo=github_repo,
            github_token=github_token,
            discord_webhook=discord_webhook,
        )
    elif issue_number:
        print("[ChatGPT Agent] No files modified; posting diagnostic comment to issue.")
        post_issue_comment_only(
            issue_number=issue_number,
            summary_markdown=final_summary,
            github_repo=github_repo,
            github_token=github_token,
        )


if __name__ == "__main__":
    main()
