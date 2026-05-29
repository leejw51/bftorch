"""Safe-ish execution of user-typed PyTorch code snippets for the JSON API.

This is an *educational* sandbox. It is NOT a hardened security boundary: it does
not block imports or dangerous builtins, because the goal is to let learners freely
experiment with PyTorch. It does, however, apply reasonable safety: every snippet
runs in a fresh namespace, output is captured, exceptions are caught and reported
as clean tracebacks, and a timeout is enforced via a worker thread.

Unlike the original Gradio executor, this version generates NO images. The frontend
renders all visuals. Instead, after execution it extracts top-level torch.Tensor /
numpy.ndarray variables as JSON-serializable dicts.

Public interface:

    run_code(code: str, timeout: float = 15.0) -> dict
"""

from __future__ import annotations

import ast
import io
import math
import threading
import time
import traceback
import contextlib

import numpy as np

# Truncation limits (approximate, in characters).
_MAX_STDOUT_CHARS = 10_000
_MAX_REPR_CHARS = 2_000

# Cap on number of elements serialized per tensor.
_MAX_TENSOR_ELEMENTS = 4096

# Names preloaded into the namespace that we do NOT report as user tensors.
_PRELOADED_NAMES = {"torch", "nn", "F", "np", "numpy", "math", "plt"}


def _build_namespace() -> dict:
    """Create a fresh global namespace pre-populated with common names.

    Users shouldn't have to import the usual suspects. ``torch`` is imported
    lazily and optionally so this module remains usable (for non-torch code and
    for self-tests) even before torch finishes installing.
    """
    ns: dict = {
        "__name__": "__sandbox__",
        "__builtins__": __builtins__,
        "np": np,
        "numpy": np,
        "math": math,
    }

    # Provide a no-op `plt` shim so legacy lesson code that calls plt.* doesn't
    # crash. The frontend renders visuals, so plotting is a silent no-op here.
    ns["plt"] = _PltShim()

    # torch is optional at import time so the sandbox degrades gracefully.
    try:
        import torch
        import torch.nn as nn
        import torch.nn.functional as F

        ns["torch"] = torch
        ns["nn"] = nn
        ns["F"] = F
    except Exception:
        # torch not available yet; torch-using snippets will raise a clean
        # NameError that is reported back to the user.
        pass

    return ns


class _PltShim:
    """Minimal stand-in for matplotlib.pyplot that swallows all calls.

    Any attribute access returns a callable that ignores its arguments and
    returns the shim itself, so chained / arbitrary plt usage is harmless.
    """

    def __getattr__(self, _name):
        def _noop(*_args, **_kwargs):
            return self

        return _noop


def _truncate(text: str, limit: int, suffix: str = "...(truncated)") -> str:
    """Truncate ``text`` to ``limit`` chars, appending ``suffix`` if cut."""
    if len(text) > limit:
        return text[:limit] + suffix
    return text


def _tensor_to_dict(name: str, value) -> dict | None:
    """Convert a torch.Tensor or numpy.ndarray to a JSON-serializable dict.

    Returns None if the value is neither type. Caps total elements at
    ``_MAX_TENSOR_ELEMENTS``; if exceeded, sends a flattened sample of the first
    N elements and sets ``truncated`` true.
    """
    # Detect numpy arrays.
    is_torch = False
    try:
        import torch

        is_torch = isinstance(value, torch.Tensor)
    except Exception:
        torch = None  # type: ignore

    is_numpy = isinstance(value, np.ndarray)

    if not (is_torch or is_numpy):
        return None

    if is_torch:
        # Detach from any graph and move to CPU for serialization.
        t = value.detach().cpu()
        shape = list(t.shape)
        dtype = str(t.dtype).replace("torch.", "")
        total = int(t.numel())
        arr = t
    else:
        shape = list(value.shape)
        dtype = str(value.dtype)
        total = int(value.size)
        arr = value

    truncated = total > _MAX_TENSOR_ELEMENTS

    if truncated:
        # Flatten and take the first N elements as a 1-D sample.
        if is_torch:
            flat = arr.reshape(-1)[:_MAX_TENSOR_ELEMENTS]
            data = flat.tolist()
        else:
            flat = arr.reshape(-1)[:_MAX_TENSOR_ELEMENTS]
            data = flat.tolist()
    else:
        data = arr.tolist()

    return {
        "name": name,
        "shape": shape,
        "dtype": dtype,
        "data": data,
        "truncated": truncated,
    }


def _collect_tensors(namespace: dict, last_value: object = None) -> list:
    """Scan the namespace for top-level tensors / arrays and serialize them.

    If ``last_value`` (the value of a trailing expression) is a tensor / array
    that isn't already one of the named top-level variables, it is appended
    under the synthetic name ``out`` — so a bare ``torch.randn(4, 4)`` with no
    assignment still produces something to render in 3D.
    """
    tensors = []
    seen_ids = set()
    for name, value in list(namespace.items()):
        if name.startswith("_"):
            continue
        if name in _PRELOADED_NAMES:
            continue
        try:
            entry = _tensor_to_dict(name, value)
        except Exception:
            entry = None
        if entry is not None:
            tensors.append(entry)
            seen_ids.add(id(value))

    # Include the trailing expression's value if it's a renderable tensor/array
    # and wasn't already captured as a named variable (avoids duplicates like
    # `x = torch.arange(4); x`).
    if last_value is not None and id(last_value) not in seen_ids:
        try:
            entry = _tensor_to_dict("out", last_value)
        except Exception:
            entry = None
        if entry is not None:
            tensors.append(entry)

    return tensors


def _exec_snippet(code: str, namespace: dict) -> tuple[str, object]:
    """Execute ``code`` in ``namespace``.

    Returns ``(repr_str, last_value)``. If the last top-level statement is an
    expression, it is evaluated separately so we can echo its (truncated) repr
    AND return its value (so a bare ``torch.randn(4, 4)`` still gets visualized,
    even though it was never bound to a variable). Otherwise returns ``("", None)``.
    Raises any exception produced by the user's code (the caller formats it).
    """
    if not code.strip():
        return "", None

    # Parse so we can detect a trailing expression to echo its repr.
    parsed = ast.parse(code, mode="exec")

    if parsed.body and isinstance(parsed.body[-1], ast.Expr):
        # Split: everything except the last node runs with exec; the last node
        # (an expression) runs with eval so we can capture its value.
        last_expr = parsed.body[-1]
        body_module = ast.Module(body=parsed.body[:-1], type_ignores=[])
        expr_module = ast.Expression(body=last_expr.value)
        ast.fix_missing_locations(body_module)
        ast.fix_missing_locations(expr_module)

        exec(compile(body_module, "<sandbox>", "exec"), namespace)
        value = eval(compile(expr_module, "<sandbox>", "eval"), namespace)

        if value is None:
            return "", None
        try:
            rendered = repr(value)
        except Exception:
            rendered = f"<unrepresentable {type(value).__name__} object>"
        return _truncate(rendered, _MAX_REPR_CHARS), value

    # No trailing expression: just execute the whole thing.
    exec(compile(parsed, "<sandbox>", "exec"), namespace)
    return "", None


def run_code(code: str, timeout: float = 15.0) -> dict:
    """Execute user PyTorch code and capture results.

    Returns a dict matching PROTOCOL.md POST /api/run:
      {
        'ok': bool,           # True if no error
        'stdout': str,        # captured print output
        'error': str | None,  # formatted traceback if it raised, else None
        'result_repr': str,   # repr of last expression value, else ''
        'duration': float,    # seconds elapsed
        'tensors': list,      # serialized top-level tensors / arrays
      }
    """
    start = time.perf_counter()

    # Shared mutable result holder populated by the worker thread.
    out: dict = {
        "ok": True,
        "stdout": "",
        "error": None,
        "result_repr": "",
        "duration": 0.0,
        "tensors": [],
    }

    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    namespace = _build_namespace()

    def _worker() -> None:
        last_value: object = None
        try:
            with contextlib.redirect_stdout(stdout_buf), contextlib.redirect_stderr(
                stderr_buf
            ):
                out["result_repr"], last_value = _exec_snippet(code, namespace)
        except Exception:
            out["error"] = traceback.format_exc()
        finally:
            # Harvest tensors even on error so partial output isn't lost.
            try:
                out["tensors"] = _collect_tensors(namespace, last_value)
            except Exception:
                out["tensors"] = []

    worker = threading.Thread(target=_worker, daemon=True)
    worker.start()
    worker.join(timeout)

    if worker.is_alive():
        # We cannot truly kill the thread; report the timeout and move on.
        out["error"] = f"Execution timed out after {timeout:g}s"

    # Assemble captured streams. stderr is appended after stdout.
    captured = stdout_buf.getvalue()
    err_stream = stderr_buf.getvalue()
    if err_stream:
        if captured and not captured.endswith("\n"):
            captured += "\n"
        captured += err_stream
    out["stdout"] = _truncate(captured, _MAX_STDOUT_CHARS)

    out["ok"] = out["error"] is None
    out["duration"] = time.perf_counter() - start
    return out


if __name__ == "__main__":

    def _summarize(label: str, result: dict) -> None:
        print(f"--- {label} ---")
        print(f"  ok          : {result['ok']}")
        print(f"  stdout      : {result['stdout']!r}")
        print(f"  error       : {result['error']!r}")
        print(f"  result_repr : {result['result_repr']!r}")
        print(f"  tensors     : {[t['name'] for t in result['tensors']]}")
        print(f"  duration    : {result['duration']:.4f}s")
        print()

    _summarize(
        "print + expression",
        run_code("print('hello sandbox')\nx = 2 + 3\nx * 10"),
    )
    _summarize("error path", run_code("1 / 0"))
    _summarize("empty input", run_code("   \n  "))
    try:
        import torch  # noqa: F401

        _summarize(
            "torch tensor op",
            run_code(
                "a = torch.tensor([1.0, 2.0, 3.0])\n"
                "b = a * 2 + 1\n"
                "print('sum =', b.sum().item())\n"
                "b"
            ),
        )
    except Exception as exc:
        print(f"--- torch tensor op (SKIPPED: torch unavailable: {exc}) ---\n")
