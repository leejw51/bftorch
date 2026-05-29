"""Streaming training demos for the PyTorch Sandbox — JSON edition.

Each demo is a generator that builds a tiny synthetic dataset + a tiny CPU model,
runs a training loop, and yields JSON-serializable progress frames so a Three.js
frontend can update live (loss number, metric, loss history for a 3D ribbon, and a
``viz`` payload of raw numbers — NO images). Yields are throttled to ~40-60 frames.

All values yielded are plain Python floats/ints/lists (never numpy/torch scalars).

Public interface:

    DEMOS                                     # dict matching GET /api/demos
    train(demo_key, epochs=200, lr=0.05, hidden=32, seed=0)   # frame generator
"""

from __future__ import annotations

import math

# Grid resolution for the classification probability surface.
_GRID = 40


# --------------------------------------------------------------------------- #
# Demo catalogue (matches GET /api/demos)
# --------------------------------------------------------------------------- #

DEMOS = {
    "linreg": {
        "key": "linreg",
        "label": "Linear Regression",
        "description": (
            "Fit a straight line y = a·x + b to noisy points with a single "
            "Linear layer and SGD. Watch the fit line snap onto the data and "
            "MSE fall."
        ),
        "viz": "regression",
    },
    "sine": {
        "key": "sine",
        "label": "Fit a Sine Wave (MLP)",
        "description": (
            "Approximate y = sin(2π·x) with a small MLP. Watch the wavy "
            "prediction curve grow to match the target sine."
        ),
        "viz": "regression",
    },
    "classify_blobs": {
        "key": "classify_blobs",
        "label": "2-Class Classifier",
        "description": (
            "Two interleaving blobs of points. A small MLP "
            "(Linear → ReLU → Linear) trained with Adam + cross-entropy learns "
            "to separate them. Watch the decision surface form."
        ),
        "viz": "classification",
    },
}


def demos_list() -> list[dict]:
    """Return DEMOS as an ordered list for GET /api/demos."""
    return list(DEMOS.values())


# --------------------------------------------------------------------------- #
# Synthetic data generators (numpy)
# --------------------------------------------------------------------------- #

def _make_linreg(n=120, a=1.8, b=0.4, noise=1.0, seed=0):
    import numpy as np

    rng = np.random.default_rng(seed)
    x = np.linspace(-3.0, 3.0, n).astype("float32")
    y = (a * x + b + rng.normal(0.0, noise, size=n)).astype("float32")
    return x.reshape(-1, 1), y.reshape(-1, 1)


def _make_two_blobs(n_per=120, spread=0.55, seed=0):
    """Two interleaving blobs arranged so a linear split is not enough."""
    import numpy as np

    rng = np.random.default_rng(seed)
    centers = np.array([[-1.2, -1.2], [1.2, 1.2]], dtype="float32")

    pts = []
    labels = []
    for cls, c in enumerate(centers):
        p = rng.normal(c, spread, size=(n_per, 2)).astype("float32")
        # swirl: rotate each point around origin by an amount that depends on
        # its radius, producing gently interleaving arms.
        r = np.sqrt((p ** 2).sum(axis=1))
        theta = 0.6 * r * (1 if cls == 0 else -1)
        cos, sin = np.cos(theta), np.sin(theta)
        xr = cos * p[:, 0] - sin * p[:, 1]
        yr = sin * p[:, 0] + cos * p[:, 1]
        p = np.stack([xr, yr], axis=1).astype("float32")
        pts.append(p)
        labels.append(np.full(n_per, cls, dtype="int64"))

    X = np.vstack(pts).astype("float32")
    y = np.concatenate(labels).astype("int64")
    idx = rng.permutation(len(y))
    return X[idx], y[idx]


def _make_sine(n=160, seed=0):
    import numpy as np

    rng = np.random.default_rng(seed)
    x = np.linspace(-1.0, 1.0, n).astype("float32")
    y = np.sin(2.0 * math.pi * x).astype("float32")
    y = (y + rng.normal(0.0, 0.04, size=n)).astype("float32")
    return x.reshape(-1, 1), y.reshape(-1, 1)


# --------------------------------------------------------------------------- #
# Viz payload builders (raw numbers only)
# --------------------------------------------------------------------------- #

def _regression_viz(X, Y, Y_pred) -> dict:
    """Build a regression viz payload, sorted ascending by x.

    X, Y, Y_pred are (N, 1) torch tensors on CPU.
    """
    xs = X.detach().cpu().reshape(-1).tolist()
    ys = Y.detach().cpu().reshape(-1).tolist()
    yps = Y_pred.detach().cpu().reshape(-1).tolist()

    order = sorted(range(len(xs)), key=lambda i: xs[i])
    return {
        "kind": "regression",
        "x": [float(xs[i]) for i in order],
        "y": [float(ys[i]) for i in order],
        "y_pred": [float(yps[i]) for i in order],
    }


def _classification_viz(model, X, Y) -> dict:
    """Build a classification viz payload with a G×G class-1 probability grid."""
    import torch
    import torch.nn.functional as F

    pts = X.detach().cpu()
    labels = Y.detach().cpu()

    x_min = float(pts[:, 0].min())
    x_max = float(pts[:, 0].max())
    y_min = float(pts[:, 1].min())
    y_max = float(pts[:, 1].max())
    # Pad the range a little so the surface frames the points.
    pad_x = 0.15 * (x_max - x_min + 1e-6)
    pad_y = 0.15 * (y_max - y_min + 1e-6)
    x_min, x_max = x_min - pad_x, x_max + pad_x
    y_min, y_max = y_min - pad_y, y_max + pad_y

    xs = torch.linspace(x_min, x_max, _GRID)
    ys = torch.linspace(y_min, y_max, _GRID)

    # Build grid points: rows indexed by ys, cols by xs.
    gy, gx = torch.meshgrid(ys, xs, indexing="ij")
    grid_pts = torch.stack([gx.reshape(-1), gy.reshape(-1)], dim=1)

    with torch.no_grad():
        logits = model(grid_pts)
        probs1 = F.softmax(logits, dim=1)[:, 1]
    probs_grid = probs1.reshape(_GRID, _GRID).tolist()

    return {
        "kind": "classification",
        "points": [[float(p[0]), float(p[1])] for p in pts.tolist()],
        "labels": [int(v) for v in labels.tolist()],
        "grid": {
            "xs": [float(v) for v in xs.tolist()],
            "ys": [float(v) for v in ys.tolist()],
            "probs": [[float(p) for p in row] for row in probs_grid],
        },
    }


# --------------------------------------------------------------------------- #
# Frame helper
# --------------------------------------------------------------------------- #

def _frame(epoch, total, loss, metric, metric_name, loss_history, log, done, viz):
    return {
        "type": "frame",
        "epoch": int(epoch),
        "total": int(total),
        "loss": float(loss),
        "metric": (None if metric is None else float(metric)),
        "metric_name": metric_name,
        "loss_history": [float(v) for v in loss_history],
        "log": log,
        "done": bool(done),
        "viz": viz,
    }


# --------------------------------------------------------------------------- #
# Public entry point
# --------------------------------------------------------------------------- #

def train(demo_key, epochs=200, lr=0.05, hidden=32, seed=0):
    """Generator yielding JSON-serializable training-progress frames."""
    epochs = int(epochs)
    if demo_key == "linreg":
        yield from _train_linreg(epochs, lr, seed)
    elif demo_key == "sine":
        yield from _train_sine(epochs, lr, hidden, seed)
    elif demo_key == "classify_blobs":
        yield from _train_classify(epochs, lr, hidden, seed)
    else:
        raise ValueError(
            f"Unknown demo_key {demo_key!r}. Choose from {list(DEMOS)}."
        )


def _yield_steps(epochs, target_frames=50):
    """How often to yield: every `step` epochs (>=1), aiming ~40-60 frames."""
    return max(1, epochs // max(1, target_frames))


# --------------------------------------------------------------------------- #
# linreg
# --------------------------------------------------------------------------- #

def _train_linreg(epochs, lr, seed):
    import torch
    import torch.nn as nn

    torch.manual_seed(seed)

    x_np, y_np = _make_linreg(seed=seed)
    X = torch.from_numpy(x_np)
    Y = torch.from_numpy(y_np)

    model = nn.Linear(1, 1)
    opt = torch.optim.SGD(model.parameters(), lr=lr)
    loss_fn = nn.MSELoss()

    loss_history = []
    step = _yield_steps(epochs)

    for epoch in range(1, epochs + 1):
        opt.zero_grad()
        pred = model(X)
        loss = loss_fn(pred, Y)
        loss.backward()
        opt.step()
        loss_history.append(float(loss.item()))

        last = epoch == epochs
        if epoch % step == 0 or last:
            with torch.no_grad():
                yp = model(X)
            mse = float(loss.item())
            w = float(model.weight.item())
            b = float(model.bias.item())
            log = (f"epoch {epoch}/{epochs}  MSE={mse:.4f}  "
                   f"fit: y = {w:.3f}·x + {b:.3f}")
            yield _frame(epoch, epochs, mse, mse, "MSE",
                         loss_history, log, last, _regression_viz(X, Y, yp))


# --------------------------------------------------------------------------- #
# classify_blobs
# --------------------------------------------------------------------------- #

def _train_classify(epochs, lr, hidden, seed):
    import torch
    import torch.nn as nn

    torch.manual_seed(seed)

    X_np, y_np = _make_two_blobs(seed=seed)
    X = torch.from_numpy(X_np)
    Y = torch.from_numpy(y_np)

    model = nn.Sequential(
        nn.Linear(2, hidden),
        nn.ReLU(),
        nn.Linear(hidden, 2),
    )
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.CrossEntropyLoss()

    loss_history = []
    step = _yield_steps(epochs)

    for epoch in range(1, epochs + 1):
        opt.zero_grad()
        logits = model(X)
        loss = loss_fn(logits, Y)
        loss.backward()
        opt.step()

        with torch.no_grad():
            acc = float((logits.argmax(dim=1) == Y).float().mean().item())
        loss_history.append(float(loss.item()))

        last = epoch == epochs
        if epoch % step == 0 or last:
            log = (f"epoch {epoch}/{epochs}  loss={loss.item():.4f}  "
                   f"acc={acc * 100:.1f}%")
            yield _frame(epoch, epochs, float(loss.item()), acc, "accuracy",
                         loss_history, log, last,
                         _classification_viz(model, X, Y))


# --------------------------------------------------------------------------- #
# sine
# --------------------------------------------------------------------------- #

def _train_sine(epochs, lr, hidden, seed):
    import torch
    import torch.nn as nn

    torch.manual_seed(seed)

    x_np, y_np = _make_sine(seed=seed)
    X = torch.from_numpy(x_np)
    Y = torch.from_numpy(y_np)

    model = nn.Sequential(
        nn.Linear(1, hidden),
        nn.Tanh(),
        nn.Linear(hidden, hidden),
        nn.Tanh(),
        nn.Linear(hidden, 1),
    )
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.MSELoss()

    loss_history = []
    step = _yield_steps(epochs)

    for epoch in range(1, epochs + 1):
        opt.zero_grad()
        pred = model(X)
        loss = loss_fn(pred, Y)
        loss.backward()
        opt.step()
        loss_history.append(float(loss.item()))

        last = epoch == epochs
        if epoch % step == 0 or last:
            with torch.no_grad():
                yp = model(X)
            mse = float(loss.item())
            log = f"epoch {epoch}/{epochs}  MSE={mse:.5f}"
            yield _frame(epoch, epochs, mse, mse, "MSE",
                         loss_history, log, last, _regression_viz(X, Y, yp))


# --------------------------------------------------------------------------- #
# Smoke test
# --------------------------------------------------------------------------- #

if __name__ == "__main__":
    print("Available demos:", list(DEMOS))
    for key in DEMOS:
        last = None
        count = 0
        for frame in train(key, epochs=40, lr=0.05, seed=0):
            count += 1
            last = frame
        print(f"{key}: {count} frames, final done={last['done']} "
              f"viz.kind={last['viz']['kind']}")
