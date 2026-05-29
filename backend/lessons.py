"""PyTorch Sandbox Trainer — curriculum module.

This module defines a sequence of bite-sized, interactive PyTorch lessons.
Each lesson is a plain dict with the keys:

    id           : short stable identifier (used for lookup / URLs)
    title        : human-friendly title shown in the dropdown
    explanation  : markdown teaching text (intro, key idea, notice, "Try this")
    starter_code : runnable Python the user can edit and execute
    hint         : a nudge for when the user gets stuck

The starter code runs inside a namespace where the following names are ALREADY
imported by the app's executor (so lessons must NOT import them):

    torch, nn (torch.nn), F (torch.nn.functional), np (numpy), math,
    plt (matplotlib.pyplot)
"""

from __future__ import annotations

LESSONS: list[dict] = [
    # ------------------------------------------------------------------ #
    {
        "id": "tensors-101",
        "title": "1. Tensors 101",
        "explanation": """
## Tensors 101

A **tensor** is PyTorch's core data structure: an n-dimensional array, much
like a NumPy array, but with super-powers (autograd + GPU support).

**Key idea.** Every tensor has three things you'll constantly inspect:

- `.shape` — the size along each dimension
- `.dtype` — the element type (`torch.float32`, `torch.int64`, ...)
- `.device` — where it lives (`cpu` or `cuda`)

You can build tensors from Python lists, with factory functions
(`torch.zeros`, `torch.ones`, `torch.arange`, `torch.randn`), or from NumPy.

**What to notice in the output.** The default float type is `float32` and the
default integer type is `int64`. Tensors created from a Python list of ints
become `int64`; add a decimal and they become `float32`.

**Try this:** change `torch.tensor([1, 2, 3])` to `torch.tensor([1.0, 2, 3])`
and watch the dtype flip from `int64` to `float32`.
""".strip(),
        "starter_code": '''\
# torch, nn, F, np, math, plt are already imported for you.

# Build a tensor straight from a Python list:
a = torch.tensor([[1, 2, 3],
                  [4, 5, 6]])
print("a =\\n", a)
print("shape:", a.shape, "| dtype:", a.dtype, "| device:", a.device)

# Factory functions create common tensors quickly:
zeros = torch.zeros(2, 3)        # all zeros, float32
ones = torch.ones(2, 3)          # all ones
rng = torch.arange(0, 10, 2)     # like range(): 0,2,4,6,8
rand = torch.randn(2, 3)         # standard-normal random values

print("\\nzeros:\\n", zeros)
print("arange:", rng)
print("randn:\\n", rand)

# dtype and device are easy to change:
b = a.to(torch.float32)
print("\\nb dtype after .to(float32):", b.dtype)
''',
        "hint": "Try torch.ones(3, 3) or torch.full((2, 2), 7). Use a.dtype and a.shape to inspect any tensor.",
    },
    # ------------------------------------------------------------------ #
    {
        "id": "ops-broadcasting",
        "title": "2. Tensor ops & broadcasting",
        "explanation": """
## Tensor ops & broadcasting

Arithmetic on tensors is **element-wise** by default: `a + b`, `a * b`,
`a ** 2` all operate position-by-position.

**Key idea — broadcasting.** When two tensors have different shapes, PyTorch
*broadcasts* them: it stretches dimensions of size 1 (or missing leading
dimensions) so the shapes line up — without copying data. The rule, compared
right-to-left: dimensions are compatible if they're equal, or one of them is 1.

So a `(3, 1)` column plus a `(1, 4)` row produces a `(3, 4)` grid.

**Watch out:** `*` is element-wise multiply. Matrix multiplication is `@` (or
`torch.matmul`). They are NOT the same!

**What to notice.** The `(3,)` vector adds to every row of the `(2, 3)` matrix.
That's broadcasting filling in the missing leading dimension.

**Try this:** replace `m * 10` with `m @ v.reshape(3, 1)` and compare shapes.
""".strip(),
        "starter_code": '''\
# Element-wise ops
m = torch.tensor([[1., 2., 3.],
                  [4., 5., 6.]])
print("m + 100 =\\n", m + 100)      # scalar broadcasts to every element
print("m * 10  =\\n", m * 10)

# Broadcasting a (3,) vector across a (2,3) matrix:
v = torch.tensor([10., 20., 30.])
print("\\nm + v =\\n", m + v)        # v is added to each row

# Classic outer-grid broadcast: (3,1) + (1,4) -> (3,4)
col = torch.arange(3).reshape(3, 1)
row = torch.arange(4).reshape(1, 4)
print("\\n(3,1)+(1,4) ->", (col + row).shape)
print(col + row)

# Element-wise vs matrix multiply:
print("\\nelement-wise m*m? shapes must match; use matmul for linear algebra")
print("m @ v =", m @ v)            # (2,3) @ (3,) -> (2,)
''',
        "hint": "Broadcasting compares shapes right-to-left; a dim of size 1 stretches. Try col.reshape(1,3)+row to see a shape error, then fix it.",
    },
    # ------------------------------------------------------------------ #
    {
        "id": "indexing-reshaping",
        "title": "3. Indexing, slicing & reshaping",
        "explanation": """
## Indexing, slicing & reshaping

You select parts of a tensor with NumPy-style indexing, and you rearrange its
shape with `view`, `reshape`, `permute`, and `transpose`.

**Key idea.**
- `view` returns a new *view* sharing the same memory — it needs the data to be
  contiguous and the total element count to stay the same.
- `reshape` does the same but will silently copy if a view isn't possible, so
  it's the safer default.
- `permute` reorders dimensions (e.g. swap height/width/channels).
- Use `-1` to let PyTorch infer one dimension.

**What to notice.** `x[:, 1]` grabs column 1 across all rows. After
`permute(1, 0)` the shape is reversed and `x[i, j]` becomes `xt[j, i]`.

**Try this:** call `x.view(3, 4)` — it errors because 2x6=12 ≠ 3x4? Actually
2x6=12=3x4, so it works! Now try `x.view(5, 2)` and see the error.
""".strip(),
        "starter_code": '''\
x = torch.arange(12).reshape(2, 6)   # 0..11 laid out as 2 rows of 6
print("x =\\n", x)

# Indexing & slicing (rows, columns, ranges):
print("\\nrow 0      :", x[0])
print("col 1      :", x[:, 1])
print("rows>=1,cols2:4:\\n", x[1:, 2:4])

# Reshaping: total elements must stay 12
print("\\nview(3,4):\\n", x.view(3, 4))
print("reshape(-1):", x.reshape(-1))   # flatten; -1 = infer = 12

# permute / transpose swap dimensions:
xt = x.permute(1, 0)                    # (2,6) -> (6,2)
print("\\nx.shape", x.shape, "-> permute ->", xt.shape)
print("x[0,1] == xt[1,0]? ", x[0, 1].item() == xt[1, 0].item())
''',
        "hint": "Remember total element count must be preserved when reshaping. Use -1 to infer a dimension automatically.",
    },
    # ------------------------------------------------------------------ #
    {
        "id": "autograd-basics",
        "title": "4. Autograd basics",
        "explanation": """
## Autograd basics

PyTorch can compute gradients **automatically**. Mark a tensor with
`requires_grad=True` and PyTorch records every operation into a computation
graph. Call `.backward()` on a scalar result, and gradients flow back into
each leaf tensor's `.grad`.

**Key idea.** For `y = x**2`, calculus says `dy/dx = 2x`. With autograd you
never write that derivative yourself — `y.backward()` fills `x.grad` for you.

**What to notice.** `backward()` must be called on a **scalar** (or you must
pass a `gradient=` argument). That's why we reduce with `.sum()` below.
Gradients **accumulate** into `.grad`, so in training loops you zero them each
step.

**Try this:** change `y = (x ** 2).sum()` to `y = (3 * x + 1).sum()` and check
that every `x.grad` becomes `3` (the derivative of `3x+1`).
""".strip(),
        "starter_code": '''\
# A leaf tensor we want gradients for:
x = torch.tensor([1.0, 2.0, 3.0], requires_grad=True)

# Define a scalar function of x:
y = (x ** 2).sum()          # y = x1^2 + x2^2 + x3^2
print("y =", y.item())

# Backpropagate: fills x.grad with dy/dx = 2x
y.backward()
print("x.grad =", x.grad)   # expect [2, 4, 6]

# Gradients ACCUMULATE — run backward again without zeroing:
y2 = (x ** 2).sum()
y2.backward()
print("after 2nd backward (accumulated):", x.grad)  # [4, 8, 12]

# Zero them like training loops do:
x.grad.zero_()
print("after zero_():", x.grad)
''',
        "hint": "backward() works on a scalar. If your output is a vector, reduce it (.sum() or .mean()) first, or pass gradient=torch.ones_like(out).",
    },
    # ------------------------------------------------------------------ #
    {
        "id": "manual-vs-autograd",
        "title": "5. Manual gradient vs autograd",
        "explanation": """
## Manual gradient vs autograd

Let's prove autograd is correct by computing a derivative *by hand* and
comparing.

**Key idea.** Take `f(x) = sin(x) * x**2`. By the product rule:

```
f'(x) = cos(x) * x**2 + sin(x) * 2x
```

We'll evaluate that formula ourselves, then let autograd do it, and confirm
they match to within tiny floating-point error.

**What to notice.** The two numbers agree to many decimals. `torch.allclose`
returns `True`. This is the whole magic of deep learning frameworks: you
specify the *forward* computation, and exact gradients come for free.

**Try this:** change `f` to `torch.exp(x) / (1 + x)` and update the manual
derivative — or just trust autograd and delete the manual line!
""".strip(),
        "starter_code": '''\
x = torch.tensor(1.3, requires_grad=True)

# Forward computation:
f = torch.sin(x) * x ** 2
f.backward()
auto_grad = x.grad.item()

# Manual derivative via the product rule:
#   d/dx [sin(x) * x^2] = cos(x)*x^2 + sin(x)*2x
xv = x.item()
manual_grad = math.cos(xv) * xv ** 2 + math.sin(xv) * 2 * xv

print("autograd grad :", auto_grad)
print("manual   grad :", manual_grad)
print("match?        :", torch.allclose(torch.tensor(auto_grad),
                                         torch.tensor(manual_grad)))
''',
        "hint": "Use math.cos / math.sin on the plain Python float x.item(). torch.allclose tolerates tiny float error.",
    },
    # ------------------------------------------------------------------ #
    {
        "id": "nn-module",
        "title": "6. nn.Module — defining a model",
        "explanation": """
## nn.Module — defining a model

Real models are built as subclasses of `nn.Module`. You declare layers in
`__init__` and describe the data flow in `forward`.

**Key idea.** Any `nn.Module` attribute that is itself a module or a
`nn.Parameter` is automatically tracked. That means `model.parameters()` finds
all learnable weights for you — exactly what an optimizer needs.

**What to notice.** `nn.Linear(in, out)` holds a weight of shape `(out, in)`
and a bias of shape `(out,)`. Calling `model(x)` runs `forward` (don't call
`forward` directly — `__call__` also runs hooks). Printing the model shows its
architecture.

**Try this:** add a second hidden layer and a `nn.ReLU()` between them, then
re-print the parameter count.
""".strip(),
        "starter_code": '''\
class TinyMLP(nn.Module):
    def __init__(self, in_dim=4, hidden=8, out_dim=2):
        super().__init__()
        self.fc1 = nn.Linear(in_dim, hidden)   # weight (hidden, in_dim)
        self.fc2 = nn.Linear(hidden, out_dim)

    def forward(self, x):
        x = F.relu(self.fc1(x))                 # non-linearity
        return self.fc2(x)                      # raw scores (logits)

model = TinyMLP()
print(model)

# A batch of 3 examples, each with 4 features:
batch = torch.randn(3, 4)
out = model(batch)            # runs forward()
print("\\noutput shape:", out.shape)   # (3, 2)

# parameters() yields every learnable tensor:
n_params = sum(p.numel() for p in model.parameters())
print("total learnable parameters:", n_params)
''',
        "hint": "Call model(x), not model.forward(x). Inspect shapes with [p.shape for p in model.parameters()].",
    },
    # ------------------------------------------------------------------ #
    {
        "id": "linreg-scratch",
        "title": "7. Linear regression from scratch",
        "explanation": """
## Linear regression from scratch

Time to *train* something — by hand. We'll fit `y ≈ w*x + b` to noisy data
using nothing but autograd and a manual gradient-descent step.

**Key idea — the training loop.**
1. **Forward:** compute predictions `pred = w*x + b`.
2. **Loss:** measure error with mean squared error.
3. **Backward:** `loss.backward()` fills `w.grad`, `b.grad`.
4. **Update:** nudge params opposite the gradient: `w -= lr * w.grad`.
5. **Zero grads** and repeat.

We wrap the update in `torch.no_grad()` so the update itself isn't recorded by
autograd.

**What to notice.** The loss drops every few steps and the learned `w, b`
approach the true values (2.0 and -1.0).

**Try this:** raise `lr` to `0.5` and watch training diverge — learning rate
matters a lot.
""".strip(),
        "starter_code": '''\
torch.manual_seed(0)

# Synthetic data from a known line y = 2x - 1 (+ noise):
x = torch.linspace(-3, 3, 50).reshape(-1, 1)
y = 2.0 * x - 1.0 + 0.3 * torch.randn_like(x)

# Parameters we will learn:
w = torch.zeros(1, 1, requires_grad=True)
b = torch.zeros(1, requires_grad=True)
lr = 0.05

for step in range(200):
    pred = x @ w + b                 # forward
    loss = ((pred - y) ** 2).mean()  # MSE
    loss.backward()                  # gradients

    with torch.no_grad():            # update without tracking
        w -= lr * w.grad
        b -= lr * b.grad
    w.grad.zero_(); b.grad.zero_()

    if step % 40 == 0:
        print(f"step {step:3d}  loss={loss.item():.4f}")

print(f"\\nlearned w={w.item():.3f} (true 2.0), b={b.item():.3f} (true -1.0)")
''',
        "hint": "Always zero gradients each step and wrap parameter updates in torch.no_grad(). If loss explodes, lower lr.",
    },
    # ------------------------------------------------------------------ #
    {
        "id": "optim-train",
        "title": "8. Training with torch.optim",
        "explanation": """
## Training with torch.optim

Manually subtracting gradients works, but `torch.optim` does it for you — and
implements smarter rules like SGD-with-momentum and Adam.

**Key idea.** The idiomatic loop is:

```
optimizer.zero_grad()   # clear old grads
loss.backward()         # compute new grads
optimizer.step()        # update all params
```

You hand the optimizer `model.parameters()` once; it remembers them. Combined
with a built-in loss like `nn.MSELoss`, the training loop becomes tiny and
reusable.

**What to notice.** Adam converges fast and you never touch `.grad` directly.
The exact same loop trains *any* `nn.Module`.

**Try this:** swap `optim.Adam` for `optim.SGD(model.parameters(), lr=0.1)` and
compare how quickly the loss drops.
""".strip(),
        "starter_code": '''\
import torch.optim as optim   # optim is part of torch; fine to import here
torch.manual_seed(0)

# Same line-fitting task, now with a model + optimizer:
x = torch.linspace(-3, 3, 50).reshape(-1, 1)
y = 2.0 * x - 1.0 + 0.3 * torch.randn_like(x)

model = nn.Linear(1, 1)                      # one weight, one bias
loss_fn = nn.MSELoss()
optimizer = optim.Adam(model.parameters(), lr=0.1)

for step in range(200):
    optimizer.zero_grad()        # 1) clear grads
    pred = model(x)              # 2) forward
    loss = loss_fn(pred, y)     # 3) loss
    loss.backward()             # 4) backward
    optimizer.step()            # 5) update

    if step % 40 == 0:
        print(f"step {step:3d}  loss={loss.item():.4f}")

w = model.weight.item(); b = model.bias.item()
print(f"\\nlearned w={w:.3f} (true 2.0), b={b:.3f} (true -1.0)")
''',
        "hint": "Order matters: zero_grad -> forward -> loss -> backward -> step. torch.optim is imported as optim here.",
    },
    # ------------------------------------------------------------------ #
    {
        "id": "loss-functions",
        "title": "9. Loss functions: MSE & CrossEntropy",
        "explanation": """
## Loss functions: MSE & CrossEntropy

A **loss** turns "how wrong is the model?" into a single number to minimize.
Two workhorses:

**MSE (Mean Squared Error)** — for **regression** (predicting numbers).
It averages `(pred - target)**2`. Big errors are punished quadratically.

**Cross-Entropy** — for **classification**. `nn.CrossEntropyLoss` expects
**raw logits** (NOT softmaxed) and integer class labels. Internally it does
`log_softmax` + negative log-likelihood. Loss is low when the logit for the
correct class is highest.

**What to notice.** When we feed logits that strongly favor the true classes,
cross-entropy is small; flatten the logits toward equal and the loss rises
toward `ln(num_classes)` (the "I'm just guessing" value).

**Try this:** set `good_logits` all to zeros (total uncertainty) and confirm
the loss is about `ln(3) ≈ 1.0986`.
""".strip(),
        "starter_code": '''\
# --- MSE for regression ---
pred = torch.tensor([2.5, 0.0, 2.1])
target = torch.tensor([3.0, -0.5, 2.0])
mse = nn.MSELoss()
print("MSE loss:", mse(pred, target).item())

# --- CrossEntropy for classification ---
# 2 samples, 3 classes. Inputs are LOGITS (unnormalized scores).
labels = torch.tensor([0, 2])             # true class indices
ce = nn.CrossEntropyLoss()

confident = torch.tensor([[5.0, 0.0, 0.0],   # strongly class 0  (correct)
                          [0.0, 0.0, 5.0]])  # strongly class 2  (correct)
print("CE (confident & correct):", ce(confident, labels).item())

unsure = torch.zeros(2, 3)                  # all classes equal
print("CE (totally unsure)     :", ce(unsure, labels).item(),
      " ~ ln(3) =", round(math.log(3), 4))
''',
        "hint": "nn.CrossEntropyLoss takes RAW logits and integer labels — do NOT apply softmax yourself. MSE takes floats of matching shape.",
    },
    # ------------------------------------------------------------------ #
    {
        "id": "activations-plot",
        "title": "10. Activation functions (+ plot)",
        "explanation": """
## Activation functions (+ plot)

**Activations** are the non-linearities between layers — without them a deep
network would collapse into a single linear map. Three classics:

- **ReLU** `max(0, x)` — cheap, sparse, the default for hidden layers.
- **Sigmoid** `1 / (1 + e^-x)` — squashes to (0, 1); used for probabilities.
- **Tanh** — squashes to (-1, 1); zero-centered cousin of sigmoid.

**Key idea.** Their *shape* matters for training: sigmoid/tanh saturate (flat
tails → tiny gradients → "vanishing gradients"), while ReLU keeps a constant
gradient of 1 for positive inputs.

**What to notice.** In the plot, ReLU is a hinge at 0, sigmoid rises smoothly
from 0 to 1, and tanh from -1 to 1. The flat tails are where gradients die.

**Try this:** add `F.leaky_relu(x, 0.1)` to the plot and see how it keeps a
small slope for negative inputs.
""".strip(),
        "starter_code": '''\
x = torch.linspace(-6, 6, 200)

relu = F.relu(x)
sigmoid = torch.sigmoid(x)
tanh = torch.tanh(x)

# Print a few sample values:
for name, y in [("relu", relu), ("sigmoid", sigmoid), ("tanh", tanh)]:
    print(f"{name:8s} at x=-2,0,2 -> "
          f"{y[60].item():+.3f}, {y[100].item():+.3f}, {y[140].item():+.3f}")

# Plot all three (plt is preloaded):
plt.figure(figsize=(6, 4))
plt.plot(x.numpy(), relu.numpy(), label="ReLU")
plt.plot(x.numpy(), sigmoid.numpy(), label="Sigmoid")
plt.plot(x.numpy(), tanh.numpy(), label="Tanh")
plt.axhline(0, color="gray", lw=0.5); plt.axvline(0, color="gray", lw=0.5)
plt.title("Activation functions"); plt.xlabel("x"); plt.ylabel("f(x)")
plt.legend(); plt.grid(True, alpha=0.3)
plt.show()
''',
        "hint": "All three are available via F (F.relu) or torch (torch.sigmoid, torch.tanh). Convert tensors with .numpy() before plotting.",
    },
    # ------------------------------------------------------------------ #
    {
        "id": "toy-classifier",
        "title": "11. A tiny classifier (bonus)",
        "explanation": """
## A tiny classifier (bonus)

Let's put it together: a small network that classifies 2-D points into two
clusters, trained with cross-entropy and Adam.

**Key idea.** Classification = produce one logit per class, then minimize
cross-entropy against integer labels. We make two Gaussian blobs (class 0 near
(-2,-2), class 1 near (+2,+2)), train, and measure accuracy.

**What to notice.** Loss falls and accuracy climbs toward ~100% — the blobs are
easily separable. `logits.argmax(dim=1)` turns scores into predicted labels.

**Try this:** move the blob centers closer together (e.g. (-0.5,-0.5) and
(0.5,0.5)) so they overlap, and watch accuracy drop — harder problem!
""".strip(),
        "starter_code": '''\
import torch.optim as optim
torch.manual_seed(0)

# Two Gaussian blobs -> labels 0 and 1:
n = 100
c0 = torch.randn(n, 2) + torch.tensor([-2.0, -2.0])
c1 = torch.randn(n, 2) + torch.tensor([2.0, 2.0])
X = torch.cat([c0, c1], dim=0)
Y = torch.cat([torch.zeros(n), torch.ones(n)]).long()   # int labels

model = nn.Sequential(nn.Linear(2, 16), nn.ReLU(), nn.Linear(16, 2))
opt = optim.Adam(model.parameters(), lr=0.05)
loss_fn = nn.CrossEntropyLoss()

for epoch in range(100):
    opt.zero_grad()
    logits = model(X)
    loss = loss_fn(logits, Y)
    loss.backward(); opt.step()
    if epoch % 25 == 0:
        acc = (logits.argmax(dim=1) == Y).float().mean()
        print(f"epoch {epoch:3d}  loss={loss.item():.4f}  acc={acc.item():.2%}")

final_acc = (model(X).argmax(dim=1) == Y).float().mean()
print(f"\\nfinal accuracy: {final_acc.item():.2%}")
''',
        "hint": "Labels for CrossEntropyLoss must be int64 (.long()). Use logits.argmax(dim=1) to get predicted classes.",
    },
    # ------------------------------------------------------------------ #
    {
        "id": "save-load",
        "title": "12. Saving & loading (bonus)",
        "explanation": """
## Saving & loading a model (bonus)

To persist a trained model, save its **`state_dict`** — an ordered dict mapping
each parameter/buffer name to its tensor.

**Key idea.** The recommended pattern saves *weights*, not the Python object:

```
torch.save(model.state_dict(), "model.pt")
...
model = MyModel()                 # recreate the architecture
model.load_state_dict(torch.load("model.pt"))
model.eval()
```

This is robust across refactors because it doesn't pickle your class. Here we
use an in-memory buffer (`io.BytesIO`) so nothing touches your disk.

**What to notice.** The freshly created model gives different outputs until we
load the saved weights — afterwards its output matches the original exactly.

**Try this:** print `list(model.state_dict().keys())` to see the parameter
names (`weight`, `bias`, ...).
""".strip(),
        "starter_code": '''\
import io
torch.manual_seed(0)

model = nn.Linear(3, 2)
x = torch.randn(1, 3)
original_out = model(x)

# 1) Save the state_dict (here to an in-memory buffer):
buffer = io.BytesIO()
torch.save(model.state_dict(), buffer)
print("state_dict keys:", list(model.state_dict().keys()))

# 2) A brand-new model has random weights -> different output:
fresh = nn.Linear(3, 2)
print("fresh matches original?", torch.allclose(fresh(x), original_out))

# 3) Load the saved weights into the fresh model:
buffer.seek(0)
fresh.load_state_dict(torch.load(buffer))
fresh.eval()
print("after load matches original?", torch.allclose(fresh(x), original_out))
''',
        "hint": "Save model.state_dict(), not the model object. Recreate the same architecture before load_state_dict, then call .eval() for inference.",
    },
]


def lesson_titles() -> list[str]:
    """Return the ordered list of lesson titles (for a dropdown)."""
    return [lesson["title"] for lesson in LESSONS]


def get_lesson(title_or_id) -> dict:
    """Look up a lesson by its exact title string OR its id.

    Raises KeyError if no lesson matches.
    """
    for lesson in LESSONS:
        if lesson["title"] == title_or_id or lesson["id"] == title_or_id:
            return lesson
    raise KeyError(f"No lesson found with title or id: {title_or_id!r}")


if __name__ == "__main__":
    _required = {"id", "title", "explanation", "starter_code", "hint"}

    _seen_ids = set()
    for _lesson in LESSONS:
        # every required key present and a non-empty string
        missing = _required - set(_lesson)
        assert not missing, f"lesson {_lesson.get('id')!r} missing keys: {missing}"
        for _k in _required:
            assert isinstance(_lesson[_k], str) and _lesson[_k].strip(), (
                f"lesson {_lesson.get('id')!r} has empty/invalid {_k!r}"
            )

        # unique ids
        assert _lesson["id"] not in _seen_ids, f"duplicate id: {_lesson['id']!r}"
        _seen_ids.add(_lesson["id"])

        # starter_code must compile
        compile(_lesson["starter_code"], "<lesson>", "exec")

    # lookup helpers behave
    assert lesson_titles() == [l["title"] for l in LESSONS]
    assert get_lesson(LESSONS[0]["title"]) is LESSONS[0]
    assert get_lesson(LESSONS[0]["id"]) is LESSONS[0]

    print(f"OK: {len(LESSONS)} lessons")
