#!/usr/bin/env python3
"""Renders /srv/agrorende/.env from environment variables (T18, deploy.yml).

    python3 infra/scripts/render-env.py <output file> NAME [NAME ...]

Each NAME is read from the process environment (GitHub Environment secrets and variables mapped
into the step). Unset or empty names are written empty so that validate-env.sh can report them.
Values are quoted for the Docker Compose .env parser: single quotes keep a value literal (no
`${...}` interpolation); values with a newline or a single quote use double quotes with escapes.
The file is created with mode 600 and secret values are never printed.
"""

import os
import sys


def quote(value: str) -> str:
    if "\n" not in value and "'" not in value:
        return f"'{value}'"
    escaped = (
        value.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("$", "\\$")
        .replace("\r", "")
        .replace("\n", "\\n")
    )
    return f'"{escaped}"'


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: render-env.py <output file> NAME [NAME ...]", file=sys.stderr)
        return 2
    output, names = sys.argv[1], sys.argv[2:]
    lines = ["# Written by deploy.yml from the GitHub Environment. Do not edit on the VM."]
    for name in names:
        if not name.replace("_", "").isalnum():
            print(f"render-env: invalid variable name {name!r}", file=sys.stderr)
            return 2
        lines.append(f"{name}={quote(os.environ.get(name, ''))}")
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
    os.chmod(output, 0o600)
    print(f"render-env: wrote {len(names)} variables to {output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
