// hints.ts — curated PyTorch autocomplete entries so users LEARN while typing.
// Each entry maps to a CodeMirror Completion: `label` (what's inserted),
// `detail` (a short signature, shown dim on the right), `info` (a one-line
// explanation shown in the docs popup) and `example` (a runnable snippet that
// the app loads into the editor so the user can run, tweak and re-run it).

export interface PyHint {
  label: string;
  detail: string;
  info: string;
  /** completion type → drives the little icon in the popup */
  type?: 'function' | 'method' | 'class' | 'property' | 'keyword' | 'constant';
  /** a short runnable snippet demonstrating this entry */
  example: string;
}

export interface HintGroup {
  category: string;
  items: PyHint[];
}

export const HINT_GROUPS: HintGroup[] = [
  {
    category: 'Create tensors',
    items: [
      {
        label: 'torch.tensor',
        detail: '(data, dtype=None)',
        info: 'Create a tensor from a Python list/number.',
        type: 'function',
        example: `# build a tensor directly from a Python list
x = torch.tensor([[1, 2], [3, 4]])
x`,
      },
      {
        label: 'torch.zeros',
        detail: '(*size)',
        info: 'Tensor filled with 0s of the given shape.',
        type: 'function',
        example: `# a 2x3 grid of zeros
torch.zeros(2, 3)`,
      },
      {
        label: 'torch.ones',
        detail: '(*size)',
        info: 'Tensor filled with 1s of the given shape.',
        type: 'function',
        example: `# a 2x3 grid of ones
torch.ones(2, 3)`,
      },
      {
        label: 'torch.full',
        detail: '(size, fill_value)',
        info: 'Tensor of `size` filled with a constant.',
        type: 'function',
        example: `# fill a 2x2 tensor with the value 7
torch.full((2, 2), 7.0)`,
      },
      {
        label: 'torch.eye',
        detail: '(n)',
        info: 'n×n identity matrix.',
        type: 'function',
        example: `# 3x3 identity matrix (1s on the diagonal)
torch.eye(3)`,
      },
      {
        label: 'torch.arange',
        detail: '(start, end, step)',
        info: 'Like range(): evenly spaced values by step.',
        type: 'function',
        example: `# values 0,2,4,6,8 (step of 2)
torch.arange(0, 10, 2)`,
      },
      {
        label: 'torch.linspace',
        detail: '(start, end, steps)',
        info: '`steps` evenly spaced values from start to end.',
        type: 'function',
        example: `# 5 points evenly spaced from 0 to 1 (inclusive)
torch.linspace(0, 1, 5)`,
      },
      {
        label: 'torch.randn',
        detail: '(*size)',
        info: 'Random values from a standard normal N(0,1).',
        type: 'function',
        example: `# random values from a normal distribution
torch.randn(2, 3)`,
      },
      {
        label: 'torch.rand',
        detail: '(*size)',
        info: 'Random values uniform in [0, 1).',
        type: 'function',
        example: `# random values uniform in [0, 1)
torch.rand(2, 3)`,
      },
      {
        label: 'torch.randint',
        detail: '(low, high, size)',
        info: 'Random integers in [low, high).',
        type: 'function',
        example: `# random integers in [0, 10) shaped 2x3
torch.randint(0, 10, (2, 3))`,
      },
      {
        label: 'torch.zeros_like',
        detail: '(input)',
        info: 'Zeros with the same shape & dtype as input.',
        type: 'function',
        example: `x = torch.randn(2, 3)
# zeros matching x's shape & dtype
torch.zeros_like(x)`,
      },
      {
        label: 'torch.from_numpy',
        detail: '(ndarray)',
        info: 'Wrap a NumPy array as a tensor (shares memory).',
        type: 'function',
        example: `a = np.array([1.0, 2.0, 3.0])
# wrap the numpy array as a tensor
torch.from_numpy(a)`,
      },
      {
        label: 'torch.manual_seed',
        detail: '(seed)',
        info: 'Seed the RNG for reproducible results.',
        type: 'function',
        example: `# seeding makes randn reproducible
torch.manual_seed(0)
torch.randn(3)`,
      },
    ],
  },
  {
    category: 'Reshape',
    items: [
      {
        label: 'torch.reshape',
        detail: '(input, shape)',
        info: 'Return a tensor with a new shape.',
        type: 'function',
        example: `x = torch.arange(6)
# reshape 6 values into a 2x3 grid
torch.reshape(x, (2, 3))`,
      },
      {
        label: 'view',
        detail: '.view(*shape)',
        info: 'Reshape without copying (needs contiguous memory). Use -1 to infer a dim.',
        type: 'method',
        example: `x = torch.arange(6)
# -1 lets PyTorch infer that dim (here 3)
x.view(2, -1)`,
      },
      {
        label: 'reshape',
        detail: '.reshape(*shape)',
        info: 'Reshape, copying if necessary. Use -1 to infer a dim.',
        type: 'method',
        example: `x = torch.arange(6)
# reshape into 3 rows, 2 cols
x.reshape(3, 2)`,
      },
      {
        label: 'flatten',
        detail: '.flatten(start_dim=0, end_dim=-1)',
        info: 'Collapse a range of dims into one.',
        type: 'method',
        example: `x = torch.arange(6).reshape(2, 3)
# collapse everything into 1-D
x.flatten()`,
      },
      {
        label: 'ravel',
        detail: '.ravel()',
        info: 'Flatten to 1-D (contiguous copy if needed).',
        type: 'method',
        example: `x = torch.arange(6).reshape(2, 3)
# flatten to a 1-D tensor
x.ravel()`,
      },
      {
        label: 'squeeze',
        detail: '.squeeze(dim=None)',
        info: 'Remove size-1 dimensions.',
        type: 'method',
        example: `x = torch.zeros(1, 3, 1)
# drop the size-1 dims -> shape (3,)
print(x.squeeze().shape)
x.squeeze()`,
      },
      {
        label: 'unsqueeze',
        detail: '.unsqueeze(dim)',
        info: 'Insert a size-1 dimension at `dim`.',
        type: 'method',
        example: `x = torch.tensor([1, 2, 3])
# add a new dim at front -> shape (1, 3)
print(x.unsqueeze(0).shape)
x.unsqueeze(0)`,
      },
      {
        label: 'contiguous',
        detail: '.contiguous()',
        info: 'Return a tensor with contiguous memory (after permute/transpose).',
        type: 'method',
        example: `x = torch.arange(6).reshape(2, 3).t()
# make memory contiguous after transpose
y = x.contiguous()
print(y.is_contiguous())
y`,
      },
    ],
  },
  {
    category: 'Reorder dims',
    items: [
      {
        label: 'permute',
        detail: '.permute(*dims)',
        info: 'Reorder ALL dimensions, e.g. x.permute(0,2,1) swaps the last two. A view, not a copy.',
        type: 'method',
        example: `x = torch.randn(2, 3, 4)
# swap the last two dims -> (2, 4, 3)
print(x.permute(0, 2, 1).shape)`,
      },
      {
        label: 'torch.permute',
        detail: '(input, dims)',
        info: 'Functional form: reorder dimensions to the given order.',
        type: 'function',
        example: `x = torch.randn(2, 3, 4)
# functional permute -> (4, 3, 2)
print(torch.permute(x, (2, 1, 0)).shape)`,
      },
      {
        label: 'transpose',
        detail: '.transpose(dim0, dim1)',
        info: 'Swap exactly two dimensions, e.g. (C,H,W)→(C,W,H).',
        type: 'method',
        example: `x = torch.randn(2, 3)
# swap dims 0 and 1 -> shape (3, 2)
x.transpose(0, 1)`,
      },
      {
        label: 'torch.transpose',
        detail: '(input, dim0, dim1)',
        info: 'Functional form: swap two dimensions.',
        type: 'function',
        example: `x = torch.randn(2, 3)
# functional swap of dims 0 and 1
torch.transpose(x, 0, 1)`,
      },
      {
        label: 't',
        detail: '.t()',
        info: 'Transpose a 2-D tensor (swap rows/cols). Matrices only.',
        type: 'method',
        example: `x = torch.arange(6).reshape(2, 3)
# transpose rows and columns
x.t()`,
      },
      {
        label: 'T',
        detail: '.T',
        info: 'Reverse all dimensions (transpose). For 2-D it is the matrix transpose.',
        type: 'property',
        example: `x = torch.arange(6).reshape(2, 3)
# .T reverses all dimensions
x.T`,
      },
      {
        label: 'swapaxes',
        detail: '.swapaxes(a, b)',
        info: 'NumPy-style alias for transpose(a, b).',
        type: 'method',
        example: `x = torch.randn(2, 3)
# numpy-style swap of axes 0 and 1
x.swapaxes(0, 1)`,
      },
      {
        label: 'movedim',
        detail: '.movedim(src, dst)',
        info: 'Move a dimension from position src to dst.',
        type: 'method',
        example: `x = torch.randn(2, 3, 4)
# move dim 0 to the end -> (3, 4, 2)
print(x.movedim(0, 2).shape)`,
      },
      {
        label: 'torch.flip',
        detail: '(input, dims)',
        info: 'Reverse the order of elements along the given dims.',
        type: 'function',
        example: `x = torch.arange(6).reshape(2, 3)
# reverse the columns (dim 1)
torch.flip(x, dims=[1])`,
      },
      {
        label: 'torch.roll',
        detail: '(input, shifts, dims)',
        info: 'Circularly shift elements along a dim.',
        type: 'function',
        example: `x = torch.arange(5)
# circularly shift right by 2
torch.roll(x, shifts=2, dims=0)`,
      },
      {
        label: 'torch.rot90',
        detail: '(input, k=1, dims=(0,1))',
        info: 'Rotate a tensor 90° k times in the dims plane.',
        type: 'function',
        example: `x = torch.arange(4).reshape(2, 2)
# rotate the matrix 90 degrees
torch.rot90(x, k=1, dims=(0, 1))`,
      },
    ],
  },
  {
    category: 'Expand & repeat',
    items: [
      {
        label: 'expand',
        detail: '.expand(*sizes)',
        info: 'Broadcast size-1 dims to a larger size WITHOUT copying memory.',
        type: 'method',
        example: `x = torch.tensor([[1], [2], [3]])
# broadcast the size-1 column to width 4
x.expand(3, 4)`,
      },
      {
        label: 'expand_as',
        detail: '.expand_as(other)',
        info: 'Expand to match another tensor’s shape.',
        type: 'method',
        example: `x = torch.tensor([[1], [2]])
other = torch.zeros(2, 3)
# expand x to match other's shape
x.expand_as(other)`,
      },
      {
        label: 'repeat',
        detail: '.repeat(*sizes)',
        info: 'Tile the tensor along each dim (does copy memory).',
        type: 'method',
        example: `x = torch.tensor([1, 2, 3])
# tile twice along a new outer dim
x.repeat(2, 1)`,
      },
      {
        label: 'torch.repeat_interleave',
        detail: '(input, repeats, dim)',
        info: 'Repeat each element `repeats` times along a dim.',
        type: 'function',
        example: `x = torch.tensor([1, 2, 3])
# repeat each element twice
torch.repeat_interleave(x, 2)`,
      },
      {
        label: 'torch.broadcast_to',
        detail: '(input, shape)',
        info: 'Broadcast a tensor to a new shape (a view).',
        type: 'function',
        example: `x = torch.tensor([1, 2, 3])
# broadcast the row to a 2x3 view
torch.broadcast_to(x, (2, 3))`,
      },
    ],
  },
  {
    category: 'Combine & split',
    items: [
      {
        label: 'torch.cat',
        detail: '(tensors, dim=0)',
        info: 'Concatenate tensors along an EXISTING dim (shapes match elsewhere).',
        type: 'function',
        example: `a = torch.zeros(2, 2)
b = torch.ones(2, 2)
# stack rows along dim 0 -> shape (4, 2)
torch.cat([a, b], dim=0)`,
      },
      {
        label: 'torch.stack',
        detail: '(tensors, dim=0)',
        info: 'Stack tensors along a NEW dimension.',
        type: 'function',
        example: `a = torch.tensor([1, 2])
b = torch.tensor([3, 4])
# new dim 0 -> shape (2, 2)
torch.stack([a, b], dim=0)`,
      },
      {
        label: 'torch.chunk',
        detail: '(input, chunks, dim=0)',
        info: 'Split into `chunks` roughly equal pieces.',
        type: 'function',
        example: `x = torch.arange(6)
# split into 3 pieces
parts = torch.chunk(x, 3)
print(parts)`,
      },
      {
        label: 'torch.split',
        detail: '(input, size, dim=0)',
        info: 'Split into pieces of a given size along a dim.',
        type: 'function',
        example: `x = torch.arange(6)
# pieces of size 2 each
parts = torch.split(x, 2)
print(parts)`,
      },
      {
        label: 'torch.unbind',
        detail: '(input, dim=0)',
        info: 'Remove a dim and return a tuple of slices.',
        type: 'function',
        example: `x = torch.arange(6).reshape(2, 3)
# split into rows along dim 0
rows = torch.unbind(x, dim=0)
print(rows)`,
      },
      {
        label: 'torch.tile',
        detail: '(input, dims)',
        info: 'NumPy-style tiling (repeat) of a tensor.',
        type: 'function',
        example: `x = torch.tensor([1, 2, 3])
# tile the row twice end-to-end
torch.tile(x, (2,))`,
      },
    ],
  },
  {
    category: 'Indexing',
    items: [
      {
        label: 'torch.gather',
        detail: '(input, dim, index)',
        info: 'Gather values along a dim using an index tensor.',
        type: 'function',
        example: `x = torch.tensor([[1, 2], [3, 4]])
idx = torch.tensor([[0, 0], [1, 0]])
# pick values along dim 1 by index
torch.gather(x, 1, idx)`,
      },
      {
        label: 'scatter_',
        detail: '.scatter_(dim, index, src)',
        info: 'In-place: write src into self at the indexed positions.',
        type: 'method',
        example: `x = torch.zeros(2, 3)
idx = torch.tensor([[0], [2]])
# write 1.0 at the indexed columns
x.scatter_(1, idx, 1.0)
x`,
      },
      {
        label: 'torch.index_select',
        detail: '(input, dim, index)',
        info: 'Select rows/slices along a dim by integer indices.',
        type: 'function',
        example: `x = torch.arange(9).reshape(3, 3)
idx = torch.tensor([0, 2])
# keep rows 0 and 2
torch.index_select(x, 0, idx)`,
      },
      {
        label: 'torch.masked_select',
        detail: '(input, mask)',
        info: 'Pick elements where a boolean mask is True (→ 1-D).',
        type: 'function',
        example: `x = torch.tensor([1, 2, 3, 4])
# keep elements greater than 2
torch.masked_select(x, x > 2)`,
      },
      {
        label: 'torch.where',
        detail: '(cond, a, b)',
        info: 'Element-wise select: a where cond else b.',
        type: 'function',
        example: `x = torch.tensor([-1.0, 2.0, -3.0])
# clamp negatives to 0 (a ReLU)
torch.where(x > 0, x, torch.zeros_like(x))`,
      },
      {
        label: 'torch.nonzero',
        detail: '(input)',
        info: 'Indices of the non-zero elements.',
        type: 'function',
        example: `x = torch.tensor([0, 5, 0, 3])
# indices where the value is non-zero
torch.nonzero(x)`,
      },
      {
        label: 'torch.take',
        detail: '(input, index)',
        info: 'Index the flattened tensor by a 1-D index.',
        type: 'function',
        example: `x = torch.tensor([[10, 20], [30, 40]])
# index the flattened tensor
torch.take(x, torch.tensor([0, 3]))`,
      },
    ],
  },
  {
    category: 'Matrix multiply',
    items: [
      {
        label: 'torch.matmul',
        detail: '(a, b)',
        info: 'Matrix product with broadcasting (also written a @ b).',
        type: 'function',
        example: `a = torch.randn(2, 3)
b = torch.randn(3, 4)
# matrix product -> shape (2, 4)
torch.matmul(a, b)`,
      },
      {
        label: '@',
        detail: 'a @ b',
        info: 'Matrix-multiply operator (same as torch.matmul).',
        type: 'keyword',
        example: `a = torch.randn(2, 3)
b = torch.randn(3, 2)
# @ is shorthand for matrix multiply
a @ b`,
      },
      {
        label: 'torch.mm',
        detail: '(a, b)',
        info: '2-D matrix multiply (no broadcasting).',
        type: 'function',
        example: `a = torch.randn(2, 3)
b = torch.randn(3, 4)
# strict 2-D matrix multiply
torch.mm(a, b)`,
      },
      {
        label: 'torch.bmm',
        detail: '(a, b)',
        info: 'Batched matrix multiply: (B,n,m)×(B,m,p).',
        type: 'function',
        example: `a = torch.randn(5, 2, 3)
b = torch.randn(5, 3, 4)
# batch of 5 matrix products -> (5, 2, 4)
print(torch.bmm(a, b).shape)`,
      },
      {
        label: 'torch.einsum',
        detail: "('ij,jk->ik', a, b)",
        info: 'Einstein summation — express any contraction by index notation.',
        type: 'function',
        example: `a = torch.randn(2, 3)
b = torch.randn(3, 4)
# 'ij,jk->ik' is a matrix multiply
torch.einsum('ij,jk->ik', a, b)`,
      },
      {
        label: 'torch.dot',
        detail: '(a, b)',
        info: 'Dot product of two 1-D vectors.',
        type: 'function',
        example: `a = torch.tensor([1.0, 2.0, 3.0])
b = torch.tensor([4.0, 5.0, 6.0])
# scalar dot product
torch.dot(a, b)`,
      },
      {
        label: 'torch.outer',
        detail: '(a, b)',
        info: 'Outer product of two 1-D vectors → matrix.',
        type: 'function',
        example: `a = torch.tensor([1, 2, 3])
b = torch.tensor([4, 5])
# outer product -> shape (3, 2)
torch.outer(a, b)`,
      },
    ],
  },
  {
    category: 'Element-wise math',
    items: [
      {
        label: 'torch.add',
        detail: '(a, b)',
        info: 'Element-wise addition (a + b) with broadcasting.',
        type: 'function',
        example: `a = torch.tensor([1, 2, 3])
b = torch.tensor([10, 20, 30])
# element-wise sum
torch.add(a, b)`,
      },
      {
        label: 'torch.mul',
        detail: '(a, b)',
        info: 'Element-wise multiply (a * b), NOT matrix multiply.',
        type: 'function',
        example: `a = torch.tensor([1, 2, 3])
b = torch.tensor([4, 5, 6])
# element-wise product
torch.mul(a, b)`,
      },
      {
        label: 'torch.abs',
        detail: '(input)',
        info: 'Element-wise absolute value.',
        type: 'function',
        example: `x = torch.tensor([-1.0, 2.0, -3.0])
# absolute value of each element
torch.abs(x)`,
      },
      {
        label: 'torch.sqrt',
        detail: '(input)',
        info: 'Element-wise square root.',
        type: 'function',
        example: `x = torch.tensor([1.0, 4.0, 9.0])
# square root of each element
torch.sqrt(x)`,
      },
      {
        label: 'torch.pow',
        detail: '(input, exp)',
        info: 'Element-wise power (input ** exp).',
        type: 'function',
        example: `x = torch.tensor([1.0, 2.0, 3.0])
# square each element
torch.pow(x, 2)`,
      },
      {
        label: 'torch.log',
        detail: '(input)',
        info: 'Element-wise natural log.',
        type: 'function',
        example: `x = torch.tensor([1.0, math.e, math.e ** 2])
# natural log of each element
torch.log(x)`,
      },
      {
        label: 'torch.exp',
        detail: '(input)',
        info: 'Element-wise e^x.',
        type: 'function',
        example: `x = torch.tensor([0.0, 1.0, 2.0])
# e raised to each element
torch.exp(x)`,
      },
      {
        label: 'torch.clamp',
        detail: '(input, min, max)',
        info: 'Clip values into the [min, max] range.',
        type: 'function',
        example: `x = torch.tensor([-2.0, 0.5, 3.0])
# clip into the range [0, 1]
torch.clamp(x, min=0.0, max=1.0)`,
      },
      {
        label: 'torch.sin',
        detail: '(input)',
        info: 'Element-wise sine.',
        type: 'function',
        example: `x = torch.tensor([0.0, math.pi / 2, math.pi])
# sine of each element
torch.sin(x)`,
      },
      {
        label: 'torch.sigmoid',
        detail: '(input)',
        info: 'Element-wise 1/(1+e^-x), squashes to (0,1).',
        type: 'function',
        example: `x = torch.tensor([-2.0, 0.0, 2.0])
# squash each value into (0, 1)
torch.sigmoid(x)`,
      },
      {
        label: 'torch.tanh',
        detail: '(input)',
        info: 'Element-wise hyperbolic tangent, squashes to (-1,1).',
        type: 'function',
        example: `x = torch.tensor([-2.0, 0.0, 2.0])
# squash each value into (-1, 1)
torch.tanh(x)`,
      },
      {
        label: 'torch.softmax',
        detail: '(input, dim)',
        info: 'Normalize a dim into a probability distribution.',
        type: 'function',
        example: `x = torch.tensor([1.0, 2.0, 3.0])
# turn scores into probabilities (sum to 1)
torch.softmax(x, dim=0)`,
      },
    ],
  },
  {
    category: 'Reductions',
    items: [
      {
        label: 'torch.sum',
        detail: '(input, dim=None, keepdim=False)',
        info: 'Sum elements, optionally along a dim.',
        type: 'function',
        example: `x = torch.arange(6).reshape(2, 3)
# sum every column (collapse dim 0)
torch.sum(x, dim=0)`,
      },
      {
        label: '.sum()',
        detail: '.sum(dim=None)',
        info: 'Sum of all elements (or along dim).',
        type: 'method',
        example: `x = torch.tensor([1.0, 2.0, 3.0])
# sum of all elements
x.sum()`,
      },
      {
        label: '.mean()',
        detail: '.mean(dim=None)',
        info: 'Average of elements (float dtypes).',
        type: 'method',
        example: `x = torch.tensor([1.0, 2.0, 3.0, 4.0])
# average of all elements
x.mean()`,
      },
      {
        label: '.std()',
        detail: '.std(dim=None)',
        info: 'Standard deviation of elements.',
        type: 'method',
        example: `x = torch.tensor([1.0, 2.0, 3.0, 4.0])
# standard deviation
x.std()`,
      },
      {
        label: '.prod()',
        detail: '.prod(dim=None)',
        info: 'Product of elements.',
        type: 'method',
        example: `x = torch.tensor([1, 2, 3, 4])
# product of all elements (= 24)
x.prod()`,
      },
      {
        label: '.max()',
        detail: '.max(dim=None)',
        info: 'Maximum value (and indices if dim given).',
        type: 'method',
        example: `x = torch.tensor([3, 1, 4, 1, 5])
# largest value
x.max()`,
      },
      {
        label: '.min()',
        detail: '.min(dim=None)',
        info: 'Minimum value (and indices if dim given).',
        type: 'method',
        example: `x = torch.tensor([3, 1, 4, 1, 5])
# smallest value
x.min()`,
      },
      {
        label: '.argmax()',
        detail: '.argmax(dim=None)',
        info: 'Index of the maximum value — the predicted class.',
        type: 'method',
        example: `x = torch.tensor([0.1, 0.7, 0.2])
# index of the largest value (predicted class)
x.argmax()`,
      },
      {
        label: '.argmin()',
        detail: '.argmin(dim=None)',
        info: 'Index of the minimum value.',
        type: 'method',
        example: `x = torch.tensor([0.1, 0.7, 0.2])
# index of the smallest value
x.argmin()`,
      },
      {
        label: 'torch.norm',
        detail: '(input, dim=None)',
        info: 'Vector/matrix norm (length).',
        type: 'function',
        example: `x = torch.tensor([3.0, 4.0])
# L2 norm (length) = 5.0
torch.norm(x)`,
      },
      {
        label: 'torch.cumsum',
        detail: '(input, dim)',
        info: 'Cumulative sum along a dim.',
        type: 'function',
        example: `x = torch.tensor([1, 2, 3, 4])
# running total
torch.cumsum(x, dim=0)`,
      },
      {
        label: 'torch.topk',
        detail: '(input, k, dim=-1)',
        info: 'The k largest values and their indices.',
        type: 'function',
        example: `x = torch.tensor([1.0, 5.0, 2.0, 4.0])
# the 2 largest values + their indices
vals, idx = torch.topk(x, 2)
print(vals, idx)`,
      },
      {
        label: 'torch.sort',
        detail: '(input, dim=-1)',
        info: 'Sort along a dim → (values, indices).',
        type: 'function',
        example: `x = torch.tensor([3, 1, 2])
# sorted values + original indices
vals, idx = torch.sort(x)
print(vals, idx)`,
      },
      {
        label: 'torch.unique',
        detail: '(input)',
        info: 'The distinct values in a tensor.',
        type: 'function',
        example: `x = torch.tensor([1, 2, 2, 3, 3, 3])
# the distinct values
torch.unique(x)`,
      },
    ],
  },
  {
    category: 'Comparison',
    items: [
      {
        label: 'torch.eq',
        detail: '(a, b)',
        info: 'Element-wise equality → bool tensor (a == b).',
        type: 'function',
        example: `a = torch.tensor([1, 2, 3])
b = torch.tensor([1, 0, 3])
# element-wise equality -> bool tensor
torch.eq(a, b)`,
      },
      {
        label: 'torch.allclose',
        detail: '(a, b, atol=1e-8)',
        info: 'True if all elements are approximately equal.',
        type: 'function',
        example: `a = torch.tensor([1.0, 2.0])
b = torch.tensor([1.0, 2.0 + 1e-9])
# True if all elements are ~equal
print(torch.allclose(a, b))`,
      },
      {
        label: 'torch.isnan',
        detail: '(input)',
        info: 'Element-wise check for NaN values.',
        type: 'function',
        example: `x = torch.tensor([1.0, float('nan'), 3.0])
# True where the element is NaN
torch.isnan(x)`,
      },
    ],
  },
  {
    category: 'Autograd',
    items: [
      {
        label: 'requires_grad',
        detail: '=True',
        info: 'Track operations on this tensor for autograd.',
        type: 'property',
        example: `# track operations so we can get gradients
x = torch.tensor([2.0], requires_grad=True)
print(x.requires_grad)
x`,
      },
      {
        label: 'requires_grad_',
        detail: '.requires_grad_(True)',
        info: 'In-place: start tracking gradients.',
        type: 'method',
        example: `x = torch.tensor([2.0])
# turn on gradient tracking in-place
x.requires_grad_(True)
print(x.requires_grad)`,
      },
      {
        label: '.backward()',
        detail: '.backward()',
        info: 'Compute gradients of this scalar w.r.t. leaves.',
        type: 'method',
        example: `x = torch.tensor([2.0], requires_grad=True)
y = x ** 2
# dy/dx = 2x = 4 at x=2
y.backward()
x.grad`,
      },
      {
        label: '.grad',
        detail: '.grad',
        info: 'The accumulated gradient after backward().',
        type: 'property',
        example: `x = torch.tensor([3.0], requires_grad=True)
y = x ** 2
y.backward()
# gradient stored on the leaf tensor
x.grad`,
      },
      {
        label: '.detach()',
        detail: '.detach()',
        info: 'Return a tensor cut from the autograd graph.',
        type: 'method',
        example: `x = torch.tensor([2.0], requires_grad=True)
# detached copy no longer tracks grad
d = x.detach()
print(d.requires_grad)
d`,
      },
      {
        label: 'torch.no_grad',
        detail: 'with torch.no_grad():',
        info: 'Disable gradient tracking in a block.',
        type: 'function',
        example: `x = torch.tensor([2.0], requires_grad=True)
# operations here are not tracked
with torch.no_grad():
    y = x * 3
print(y.requires_grad)`,
      },
      {
        label: '.item()',
        detail: '.item()',
        info: 'Get a Python number from a 1-element tensor.',
        type: 'method',
        example: `x = torch.tensor([42.0])
# extract a plain Python float
print(x.item())`,
      },
    ],
  },
  {
    category: 'Neural net (nn)',
    items: [
      {
        label: 'nn.Linear',
        detail: '(in_features, out_features)',
        info: 'Fully-connected layer: y = xWᵀ + b.',
        type: 'class',
        example: `lin = nn.Linear(3, 2)
x = torch.randn(4, 3)
# map 3 features -> 2 features
print(lin(x).shape)`,
      },
      {
        label: 'nn.ReLU',
        detail: '()',
        info: 'Rectified Linear Unit activation: max(0, x).',
        type: 'class',
        example: `relu = nn.ReLU()
x = torch.tensor([-1.0, 0.0, 2.0])
# clamps negatives to 0
relu(x)`,
      },
      {
        label: 'nn.Sequential',
        detail: '(*modules)',
        info: 'Chain modules into a feed-forward stack.',
        type: 'class',
        example: `net = nn.Sequential(nn.Linear(3, 4), nn.ReLU(), nn.Linear(4, 1))
x = torch.randn(2, 3)
# data flows through each module in order
print(net(x).shape)`,
      },
      {
        label: 'nn.Conv2d',
        detail: '(in_ch, out_ch, kernel_size)',
        info: '2-D convolution layer for images.',
        type: 'class',
        example: `conv = nn.Conv2d(1, 4, kernel_size=3)
x = torch.randn(1, 1, 8, 8)
# (batch, channels, H, W) -> 4 feature maps
print(conv(x).shape)`,
      },
      {
        label: 'nn.MSELoss',
        detail: '()',
        info: 'Mean-squared-error loss for regression.',
        type: 'class',
        example: `loss_fn = nn.MSELoss()
pred = torch.tensor([1.0, 2.0, 3.0])
target = torch.tensor([1.0, 2.0, 5.0])
# mean squared error
loss_fn(pred, target)`,
      },
      {
        label: 'nn.CrossEntropyLoss',
        detail: '()',
        info: 'Softmax + NLL loss for classification.',
        type: 'class',
        example: `loss_fn = nn.CrossEntropyLoss()
logits = torch.randn(3, 5)
target = torch.tensor([0, 2, 4])
# classification loss from raw logits
loss_fn(logits, target)`,
      },
      {
        label: 'nn.Module',
        detail: 'class Net(nn.Module):',
        info: 'Base class for all neural-network modules.',
        type: 'class',
        example: `class Net(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc = nn.Linear(3, 1)
    def forward(self, x):
        return self.fc(x)

net = Net()
print(net(torch.randn(2, 3)).shape)`,
      },
      {
        label: 'nn.Sigmoid',
        detail: '()',
        info: 'Sigmoid activation: 1/(1+e^-x).',
        type: 'class',
        example: `act = nn.Sigmoid()
x = torch.tensor([-2.0, 0.0, 2.0])
# squash into (0, 1)
act(x)`,
      },
      {
        label: 'nn.Tanh',
        detail: '()',
        info: 'Tanh activation, output in (-1, 1).',
        type: 'class',
        example: `act = nn.Tanh()
x = torch.tensor([-2.0, 0.0, 2.0])
# squash into (-1, 1)
act(x)`,
      },
      {
        label: 'nn.Dropout',
        detail: '(p=0.5)',
        info: 'Randomly zero activations during training (regularization).',
        type: 'class',
        example: `drop = nn.Dropout(p=0.5)
drop.train()
x = torch.ones(10)
# ~half the values are zeroed during training
drop(x)`,
      },
      {
        label: 'nn.Embedding',
        detail: '(num_embeddings, dim)',
        info: 'Lookup table mapping integer ids → vectors.',
        type: 'class',
        example: `emb = nn.Embedding(10, 3)
ids = torch.tensor([1, 5, 9])
# look up a 3-dim vector per id
print(emb(ids).shape)`,
      },
      {
        label: 'nn.BatchNorm1d',
        detail: '(num_features)',
        info: 'Normalize activations across the batch.',
        type: 'class',
        example: `bn = nn.BatchNorm1d(4)
x = torch.randn(8, 4)
# normalize each feature across the batch
print(bn(x).shape)`,
      },
      {
        label: 'forward',
        detail: 'def forward(self, x):',
        info: 'Define a module’s forward pass (called via model(x)).',
        type: 'method',
        example: `class Net(nn.Module):
    def forward(self, x):
        # forward defines what model(x) computes
        return x * 2

net = Net()
net(torch.tensor([1.0, 2.0, 3.0]))`,
      },
    ],
  },
  {
    category: 'Functional (F)',
    items: [
      {
        label: 'F.relu',
        detail: '(input)',
        info: 'Functional ReLU activation: max(0, x).',
        type: 'function',
        example: `x = torch.tensor([-1.0, 0.0, 2.0])
# functional ReLU: max(0, x)
F.relu(x)`,
      },
      {
        label: 'F.softmax',
        detail: '(input, dim)',
        info: 'Normalize a dim into a probability distribution.',
        type: 'function',
        example: `x = torch.tensor([1.0, 2.0, 3.0])
# probabilities that sum to 1
F.softmax(x, dim=0)`,
      },
      {
        label: 'F.log_softmax',
        detail: '(input, dim)',
        info: 'log(softmax(x)) — numerically stable, pairs with NLLLoss.',
        type: 'function',
        example: `x = torch.tensor([1.0, 2.0, 3.0])
# log of softmax, numerically stable
F.log_softmax(x, dim=0)`,
      },
      {
        label: 'F.cross_entropy',
        detail: '(input, target)',
        info: 'Combined softmax + cross-entropy loss (logits in).',
        type: 'function',
        example: `logits = torch.randn(3, 5)
target = torch.tensor([0, 2, 4])
# loss directly from raw logits
F.cross_entropy(logits, target)`,
      },
      {
        label: 'F.mse_loss',
        detail: '(input, target)',
        info: 'Functional mean-squared-error loss.',
        type: 'function',
        example: `pred = torch.tensor([1.0, 2.0, 3.0])
target = torch.tensor([1.5, 2.0, 2.5])
# mean squared error
F.mse_loss(pred, target)`,
      },
      {
        label: 'F.sigmoid',
        detail: '(input)',
        info: 'Functional sigmoid (use torch.sigmoid in new code).',
        type: 'function',
        example: `x = torch.tensor([-2.0, 0.0, 2.0])
# squash into (0, 1)
F.sigmoid(x)`,
      },
    ],
  },
  {
    category: 'Optimizers & training',
    items: [
      {
        label: 'torch.optim.Adam',
        detail: '(params, lr=1e-3)',
        info: 'Adaptive-moment optimizer (great default).',
        type: 'class',
        example: `model = nn.Linear(3, 1)
opt = torch.optim.Adam(model.parameters(), lr=1e-3)
# one update step on a dummy loss
loss = model(torch.randn(4, 3)).sum()
loss.backward()
opt.step()
print('stepped')`,
      },
      {
        label: 'torch.optim.SGD',
        detail: '(params, lr, momentum=0)',
        info: 'Stochastic gradient descent optimizer.',
        type: 'class',
        example: `model = nn.Linear(3, 1)
opt = torch.optim.SGD(model.parameters(), lr=0.1)
loss = model(torch.randn(4, 3)).sum()
loss.backward()
opt.step()
print('stepped')`,
      },
      {
        label: '.zero_grad()',
        detail: 'optimizer.zero_grad()',
        info: 'Reset gradients before backward().',
        type: 'method',
        example: `model = nn.Linear(3, 1)
opt = torch.optim.SGD(model.parameters(), lr=0.1)
for _ in range(2):
    opt.zero_grad()  # clear old grads
    loss = model(torch.randn(4, 3)).sum()
    loss.backward()
    opt.step()
print('trained 2 steps')`,
      },
      {
        label: '.step()',
        detail: 'optimizer.step()',
        info: 'Apply one optimizer update to the params.',
        type: 'method',
        example: `model = nn.Linear(3, 1)
opt = torch.optim.SGD(model.parameters(), lr=0.1)
loss = model(torch.randn(4, 3)).sum()
loss.backward()
# apply the gradient update
opt.step()
print('weights updated')`,
      },
      {
        label: '.parameters()',
        detail: 'model.parameters()',
        info: 'Iterator over a module’s learnable tensors.',
        type: 'method',
        example: `model = nn.Linear(3, 2)
# count the learnable tensors
params = list(model.parameters())
print(len(params), params[0].shape)`,
      },
    ],
  },
  {
    category: 'Save & load',
    items: [
      {
        label: 'torch.save',
        detail: '(obj, path)',
        info: 'Serialize a tensor / model state_dict to disk.',
        type: 'function',
        example: `import io
x = torch.tensor([1.0, 2.0, 3.0])
buf = io.BytesIO()
# save to an in-memory buffer
torch.save(x, buf)
print(buf.getbuffer().nbytes, 'bytes written')`,
      },
      {
        label: 'torch.load',
        detail: '(path)',
        info: 'Load a serialized tensor / state_dict.',
        type: 'function',
        example: `import io
buf = io.BytesIO()
torch.save(torch.tensor([1.0, 2.0, 3.0]), buf)
buf.seek(0)
# load it back from the buffer
torch.load(buf, weights_only=True)`,
      },
      {
        label: '.state_dict()',
        detail: 'model.state_dict()',
        info: 'Dict of a module’s learnable tensors (for saving).',
        type: 'method',
        example: `model = nn.Linear(3, 2)
# dict of named weight tensors
sd = model.state_dict()
print(list(sd.keys()))`,
      },
    ],
  },
  {
    category: 'Dtype & casting',
    items: [
      {
        label: '.float()',
        detail: '.float()',
        info: 'Cast to float32.',
        type: 'method',
        example: `x = torch.tensor([1, 2, 3])
# cast int -> float32
y = x.float()
print(y.dtype)
y`,
      },
      {
        label: '.long()',
        detail: '.long()',
        info: 'Cast to int64 (common for class labels / indices).',
        type: 'method',
        example: `x = torch.tensor([1.0, 2.0, 3.0])
# cast to int64
y = x.long()
print(y.dtype)
y`,
      },
      {
        label: '.int()',
        detail: '.int()',
        info: 'Cast to int32.',
        type: 'method',
        example: `x = torch.tensor([1.0, 2.5, 3.9])
# cast to int32 (truncates toward 0)
y = x.int()
print(y.dtype)
y`,
      },
      {
        label: '.bool()',
        detail: '.bool()',
        info: 'Cast to boolean (for masks).',
        type: 'method',
        example: `x = torch.tensor([0, 1, 2, 0])
# non-zero -> True, zero -> False
x.bool()`,
      },
      {
        label: '.type()',
        detail: '.type(dtype)',
        info: 'Cast to an explicit dtype.',
        type: 'method',
        example: `x = torch.tensor([1, 2, 3])
# cast to an explicit dtype
y = x.type(torch.float64)
print(y.dtype)
y`,
      },
    ],
  },
  {
    category: 'Inspect & convert',
    items: [
      {
        label: '.shape',
        detail: '.shape',
        info: 'The size of each dimension (torch.Size).',
        type: 'property',
        example: `x = torch.randn(2, 3, 4)
# size of each dimension
print(x.shape)`,
      },
      {
        label: '.dtype',
        detail: '.dtype',
        info: 'The element data type, e.g. torch.float32.',
        type: 'property',
        example: `x = torch.tensor([1.0, 2.0])
# the element data type
print(x.dtype)`,
      },
      {
        label: '.device',
        detail: '.device',
        info: 'Which device the tensor lives on (cpu/mps/cuda).',
        type: 'property',
        example: `x = torch.ones(3)
# which device the tensor lives on
print(x.device)`,
      },
      {
        label: '.ndim',
        detail: '.ndim',
        info: 'Number of dimensions (rank).',
        type: 'property',
        example: `x = torch.randn(2, 3, 4)
# number of dimensions (rank) = 3
print(x.ndim)`,
      },
      {
        label: '.size()',
        detail: '.size(dim=None)',
        info: 'Shape as a tuple, or one dim’s size.',
        type: 'method',
        example: `x = torch.randn(2, 3)
# full shape, or one dim's size
print(x.size(), x.size(1))`,
      },
      {
        label: '.numel()',
        detail: '.numel()',
        info: 'Total number of elements.',
        type: 'method',
        example: `x = torch.randn(2, 3, 4)
# total elements = 24
print(x.numel())`,
      },
      {
        label: '.dim()',
        detail: '.dim()',
        info: 'Number of dimensions (rank).',
        type: 'method',
        example: `x = torch.randn(2, 3)
# number of dimensions = 2
print(x.dim())`,
      },
      {
        label: '.clone()',
        detail: '.clone()',
        info: 'Copy a tensor (kept in the autograd graph).',
        type: 'method',
        example: `x = torch.tensor([1, 2, 3])
# independent copy
y = x.clone()
y[0] = 99
print(x, y)`,
      },
      {
        label: '.numpy()',
        detail: '.numpy()',
        info: 'Convert a CPU tensor to a NumPy array (shares memory).',
        type: 'method',
        example: `x = torch.tensor([1.0, 2.0, 3.0])
# convert to a numpy array
a = x.numpy()
print(type(a), a)`,
      },
      {
        label: '.tolist()',
        detail: '.tolist()',
        info: 'Convert a tensor to nested Python lists.',
        type: 'method',
        example: `x = torch.tensor([[1, 2], [3, 4]])
# convert to nested Python lists
print(x.tolist())`,
      },
      {
        label: '.cpu()',
        detail: '.cpu()',
        info: 'Move a tensor to the CPU.',
        type: 'method',
        example: `x = torch.ones(3)
# ensure the tensor is on the CPU
y = x.cpu()
print(y.device)`,
      },
      {
        label: '.to()',
        detail: '.to(device|dtype)',
        info: 'Move/cast a tensor to a device or dtype.',
        type: 'method',
        example: `x = torch.tensor([1, 2, 3])
# cast to float64 via .to()
y = x.to(torch.float64)
print(y.dtype)
y`,
      },
      {
        label: 'torch.device',
        detail: "('cuda'|'mps'|'cpu')",
        info: 'Pick the compute device.',
        type: 'function',
        example: `dev = torch.device('cpu')
# move a tensor to the chosen device
torch.ones(3).to(dev)`,
      },
    ],
  },
];

// Flattened view kept for the autocomplete source (do not remove — editor.ts imports this):
export const PYTORCH_HINTS: PyHint[] = HINT_GROUPS.flatMap((g) => g.items);
