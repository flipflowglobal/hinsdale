# cython: language_level=3
# cython: boundscheck=False
# cython: wraparound=False
# cython: cdivision=True
# cython: nonecheck=False
# cython: embedsignature=True
# cython: initializedcheck=False
#
# _hinsdale.pyx — Cython extension wrapping libhinsdale.so
#
# Design:
#   • All Rust calls use `with nogil` — Python thread doesn't block during analysis
#   • instructions_numpy() uses hins_instr_bulk_into() — writes directly into
#     numpy's own memory (zero intermediate buffer, zero extra copy)
#   • batch_analyze() calls hins_batch_analyze() — rayon parallel across all cores
#   • stream_disasm() yields chunks via a C callback into a Python list accumulator
#   • Runtime layout check: asserts sizeof(HinsInstr)==128 before any use
#   • All cdef classes use __slots__ equivalent (no __dict__)

from libc.stdint  cimport uint8_t, uint16_t, uint32_t, uint64_t, int32_t, int64_t
from libc.stdlib  cimport malloc, free, calloc
from libc.string  cimport memcpy, memset
from cpython.bytes cimport PyBytes_AS_STRING, PyBytes_GET_SIZE, PyBytes_Check
from cpython.mem   cimport PyMem_Malloc, PyMem_Free
from cpython.object cimport PyObject

import numpy as np
cimport numpy as np
np.import_array()

# ── C declarations ────────────────────────────────────────────────────────

cdef extern from "hinsdale_ffi.h" nogil:

    ctypedef struct HinsdaleCtx:
        pass

    ctypedef struct HinsInstr:
        uint32_t offset
        uint8_t  opcode
        uint8_t  imm_len
        uint8_t  stack_in
        uint8_t  stack_out
        uint8_t  mnemonic[16]
        uint8_t  category[16]
        uint8_t  imm_hex[68]
        uint8_t  _pad[4]
        uint64_t imm_u64
        uint8_t  has_imm_u64
        uint8_t  _pad2[7]

    ctypedef struct HinsFinding:
        char     severity[16]
        char     title[128]
        char     description[512]
        char     pattern[64]
        int32_t  offset
        uint8_t  _pad[4]

    ctypedef struct HinsFnSig:
        char     selector[12]
        uint32_t selector_u32
        char     known_name[256]
        int64_t  jump_target
        uint8_t  is_view
        uint8_t  _pad[7]

    ctypedef struct HinsSummary:
        uint32_t bytecode_len
        uint32_t instruction_count
        uint32_t block_count
        uint32_t edge_count
        uint32_t jumpdest_count
        uint32_t function_count
        uint32_t finding_count
        uint32_t risk_score
        uint32_t sstore_count
        uint32_t sload_count
        uint32_t call_count
        uint8_t  is_runtime
        uint8_t  is_proxy
        uint8_t  is_erc20_like
        uint8_t  is_erc721_like
        uint8_t  has_selfdestruct
        uint8_t  has_delegatecall
        uint8_t  has_create2
        uint8_t  _pad
        double   elapsed_ms
        char     solc_version_hint[64]

    ctypedef struct BytecodeSlice:
        const uint8_t* ptr
        size_t         len

    ctypedef uint8_t (*HinsChunkCallback)(const HinsInstr*, uint32_t, void*) nogil

    HinsdaleCtx* hins_analyze        (const uint8_t* bytecode, size_t length)
    HinsdaleCtx* hins_analyze_hex    (const char* hex_str, size_t hex_len)
    void         hins_free           (HinsdaleCtx* ctx)
    int          hins_summary        (const HinsdaleCtx* ctx, HinsSummary* out)
    uint32_t     hins_instr_count    (const HinsdaleCtx* ctx)
    int          hins_instr_at       (const HinsdaleCtx* ctx, uint32_t idx, HinsInstr* out)
    uint32_t     hins_instr_bulk     (const HinsdaleCtx* ctx, HinsInstr* buf, uint32_t n)
    uint32_t     hins_instr_bulk_into(const HinsdaleCtx* ctx, uint8_t* dst, uint32_t n)
    uint32_t     hins_batch_analyze  (const BytecodeSlice* slices, size_t count,
                                      HinsdaleCtx** out_ctxs)
    uint32_t     hins_stream_disasm  (const uint8_t* bytecode, size_t length,
                                      uint32_t chunk_size, HinsChunkCallback cb,
                                      void* user_data)
    uint32_t     hins_fn_count       (const HinsdaleCtx* ctx)
    int          hins_fn_at          (const HinsdaleCtx* ctx, uint32_t idx, HinsFnSig* out)
    uint32_t     hins_finding_count  (const HinsdaleCtx* ctx)
    int          hins_finding_at     (const HinsdaleCtx* ctx, uint32_t idx, HinsFinding* out)
    char*        hins_pseudo_source  (const HinsdaleCtx* ctx)
    char*        hins_json           (const HinsdaleCtx* ctx)
    void         hins_free_str       (char* ptr)
    uint32_t     hins_jumpdests      (const HinsdaleCtx* ctx, uint32_t* buf, uint32_t n)
    const char*  hins_version        ()
    uint32_t     hins_sizeof_instr   ()
    uint32_t     hins_sizeof_summary ()

# ── Constants ─────────────────────────────────────────────────────────────

INSTR_SIZE = 128   # sizeof(HinsInstr) — verified at import time

# numpy dtype matching HinsInstr layout exactly (packed, 128 bytes)
INSTR_DTYPE = np.dtype([
    ('offset',      '<u4'),   # 4  bytes at  0
    ('opcode',      'u1'),    # 1  byte  at  4
    ('imm_len',     'u1'),    # 1  byte  at  5
    ('stack_in',    'u1'),    # 1  byte  at  6
    ('stack_out',   'u1'),    # 1  byte  at  7
    ('mnemonic',    'S16'),   # 16 bytes at  8
    ('category',    'S16'),   # 16 bytes at 24
    ('imm_hex',     'S68'),   # 68 bytes at 40
    ('_pad',        'S4'),    #  4 bytes at 108
    ('imm_u64',     '<u8'),   #  8 bytes at 112
    ('has_imm_u64', 'u1'),    #  1 byte  at 120
    ('_pad2',       'S7'),    #  7 bytes at 121
], align=False)

assert INSTR_DTYPE.itemsize == 128, f"INSTR_DTYPE itemsize {INSTR_DTYPE.itemsize} != 128"

# ── Runtime layout verification ────────────────────────────────────────────

cdef uint32_t _rust_sizeof
with nogil:
    _rust_sizeof = hins_sizeof_instr()

if _rust_sizeof != 128:
    raise RuntimeError(
        f"HinsInstr sizeof mismatch: Rust={_rust_sizeof}, Cython=128. "
        "Recompile libhinsdale.so and _hinsdale.so together."
    )

# ── Streaming callback state (module-level, protected by GIL) ─────────────
# Used by hins_stream_disasm to accumulate chunks into Python lists.

cdef struct StreamState:
    PyObject* chunks   # pointer to Python list
    uint32_t  total

cdef uint8_t _stream_callback(
    const HinsInstr* instrs,
    uint32_t         count,
    void*            user_data
) nogil:
    """Called from Rust for each chunk. Acquires GIL to append to Python list."""
    with gil:
        state = <StreamState*>user_data
        chunk_list = <object>state.chunks
        chunk = []
        for i in range(count):
            chunk.append(_instr_to_dict(&instrs[i]))
        chunk_list.append(chunk)
        state.total += count
    return 1  # continue

cdef dict _instr_to_dict(const HinsInstr* ins):
    """Convert C struct to Python dict (used in streaming path)."""
    mnemonic = ins.mnemonic[:15].rstrip(b'\x00').decode('ascii', errors='replace')
    category = ins.category[:15].rstrip(b'\x00').decode('ascii', errors='replace')
    imm_hex  = ins.imm_hex[:67].rstrip(b'\x00').decode('ascii', errors='replace')
    return {
        'offset':   ins.offset,
        'opcode':   ins.opcode,
        'mnemonic': mnemonic,
        'category': category,
        'imm_hex':  imm_hex if imm_hex else None,
        'imm_u64':  ins.imm_u64 if ins.has_imm_u64 else None,
        'stack_in': ins.stack_in,
        'stack_out':ins.stack_out,
    }

# ── cdef classes ──────────────────────────────────────────────────────────

cdef class Instruction:
    """Single decoded EVM instruction (immutable, zero-dict)."""
    cdef readonly uint32_t offset
    cdef readonly uint8_t  opcode
    cdef readonly uint8_t  imm_len
    cdef readonly int8_t   stack_in
    cdef readonly int8_t   stack_out
    cdef readonly str      mnemonic
    cdef readonly str      category
    cdef readonly str      imm_hex      # empty string if no immediate
    cdef readonly object   imm_u64      # int or None
    cdef readonly bint     is_jumpdest

    @staticmethod
    cdef inline Instruction _from_c(const HinsInstr* c):
        cdef Instruction obj = Instruction.__new__(Instruction)
        obj.offset     = c.offset
        obj.opcode     = c.opcode
        obj.imm_len    = c.imm_len
        obj.stack_in   = <int8_t>c.stack_in
        obj.stack_out  = <int8_t>c.stack_out
        obj.mnemonic   = c.mnemonic[:15].rstrip(b'\x00').decode('ascii', errors='replace')
        obj.category   = c.category[:15].rstrip(b'\x00').decode('ascii', errors='replace')
        obj.imm_hex    = c.imm_hex[:67].rstrip(b'\x00').decode('ascii', errors='replace')
        obj.imm_u64    = c.imm_u64 if c.has_imm_u64 else None
        obj.is_jumpdest = (c.opcode == 0x5b)
        return obj

    def __repr__(self):
        imm = f" 0x{self.imm_hex}" if self.imm_hex else ""
        return f"<Instr 0x{self.offset:04x} {self.opcode:02x} {self.mnemonic}{imm}>"

    def __str__(self):
        imm    = f" 0x{self.imm_hex}" if self.imm_hex else ""
        marker = "◆" if self.is_jumpdest else " "
        return f"{marker} 0x{self.offset:04x}  {self.opcode:02x}  {self.mnemonic:<14}{imm}"

    def to_dict(self):
        return {
            'offset':    self.offset,
            'opcode':    self.opcode,
            'mnemonic':  self.mnemonic,
            'category':  self.category,
            'imm_hex':   self.imm_hex or None,
            'imm_u64':   self.imm_u64,
            'stack_in':  self.stack_in,
            'stack_out': self.stack_out,
        }


cdef class FunctionSig:
    """Recovered function signature from dispatcher."""
    cdef readonly str  selector
    cdef readonly int  selector_u32
    cdef readonly object known_name   # str or None
    cdef readonly object jump_target  # int or None
    cdef readonly bint   is_view

    @staticmethod
    cdef inline FunctionSig _from_c(const HinsFnSig* c):
        cdef FunctionSig obj = FunctionSig.__new__(FunctionSig)
        obj.selector     = c.selector[:11].rstrip(b'\x00').decode('ascii', errors='replace')
        obj.selector_u32 = c.selector_u32
        raw              = c.known_name[:255].rstrip(b'\x00').decode('ascii', errors='replace')
        obj.known_name   = raw if raw else None
        obj.jump_target  = c.jump_target if c.jump_target >= 0 else None
        obj.is_view      = bool(c.is_view)
        return obj

    def __repr__(self):
        return f"<FnSig {self.selector} {self.known_name or '???'}>"


cdef class Finding:
    """Security finding."""
    cdef readonly str    severity
    cdef readonly str    title
    cdef readonly str    description
    cdef readonly str    pattern
    cdef readonly object offset   # int or None

    @staticmethod
    cdef inline Finding _from_c(const HinsFinding* c):
        cdef Finding obj = Finding.__new__(Finding)
        obj.severity    = c.severity[:15].rstrip(b'\x00').decode('ascii', errors='replace')
        obj.title       = c.title[:127].rstrip(b'\x00').decode('ascii', errors='replace')
        obj.description = c.description[:511].rstrip(b'\x00').decode('ascii', errors='replace')
        obj.pattern     = c.pattern[:63].rstrip(b'\x00').decode('ascii', errors='replace')
        obj.offset      = c.offset if c.offset >= 0 else None
        return obj

    def __repr__(self):
        loc = f"@0x{self.offset:04x}" if self.offset is not None else ""
        return f"<Finding [{self.severity}] {self.title} {loc}>"

    def __str__(self):
        loc = f"0x{self.offset:04x}" if self.offset is not None else "—"
        return f"[{self.severity:8s}] {self.title} (@ {loc})\n           {self.description}"


cdef class Summary:
    """Stats struct — built from stack-allocated HinsSummary, no heap."""
    cdef readonly uint32_t bytecode_len
    cdef readonly uint32_t instruction_count
    cdef readonly uint32_t block_count
    cdef readonly uint32_t edge_count
    cdef readonly uint32_t jumpdest_count
    cdef readonly uint32_t function_count
    cdef readonly uint32_t finding_count
    cdef readonly uint32_t risk_score
    cdef readonly uint32_t sstore_count
    cdef readonly uint32_t sload_count
    cdef readonly uint32_t call_count
    cdef readonly bint     is_runtime
    cdef readonly bint     is_proxy
    cdef readonly bint     is_erc20_like
    cdef readonly bint     is_erc721_like
    cdef readonly bint     has_selfdestruct
    cdef readonly bint     has_delegatecall
    cdef readonly bint     has_create2
    cdef readonly double   elapsed_ms
    cdef readonly object   solc_version_hint  # str or None

    @staticmethod
    cdef inline Summary _from_c(const HinsSummary* c):
        cdef Summary obj = Summary.__new__(Summary)
        obj.bytecode_len      = c.bytecode_len
        obj.instruction_count = c.instruction_count
        obj.block_count       = c.block_count
        obj.edge_count        = c.edge_count
        obj.jumpdest_count    = c.jumpdest_count
        obj.function_count    = c.function_count
        obj.finding_count     = c.finding_count
        obj.risk_score        = c.risk_score
        obj.sstore_count      = c.sstore_count
        obj.sload_count       = c.sload_count
        obj.call_count        = c.call_count
        obj.is_runtime        = bool(c.is_runtime)
        obj.is_proxy          = bool(c.is_proxy)
        obj.is_erc20_like     = bool(c.is_erc20_like)
        obj.is_erc721_like    = bool(c.is_erc721_like)
        obj.has_selfdestruct  = bool(c.has_selfdestruct)
        obj.has_delegatecall  = bool(c.has_delegatecall)
        obj.has_create2       = bool(c.has_create2)
        obj.elapsed_ms        = c.elapsed_ms
        hint = c.solc_version_hint[:63].rstrip(b'\x00').decode('ascii', errors='replace')
        obj.solc_version_hint = hint if hint else None
        return obj

    def one_liner(self):
        return (
            f"HINSDALE │ {self.bytecode_len} bytes │ "
            f"{self.instruction_count} instrs │ {self.block_count} blocks │ "
            f"{self.function_count} fns │ {self.finding_count} findings │ "
            f"risk={self.risk_score} │ {self.elapsed_ms:.1f}ms"
        )

    def __repr__(self):
        return (f"<Summary {self.bytecode_len}b risk={self.risk_score} "
                f"{self.elapsed_ms:.1f}ms>")


# ── Main context ──────────────────────────────────────────────────────────

cdef class HinsdaleContext:
    """
    Opaque handle to a Rust HinsdaleReport on the heap.

    Lifecycle:
        ctx = HinsdaleContext.from_bytes(b)   # or from_hex("0x...")
        # ... use ctx ...
        # ctx freed automatically at GC / end of with block

    Key methods:
        ctx.summary()              → Summary  (stack-only, no alloc)
        ctx.instructions()         → list[Instruction]
        ctx.instructions_numpy()   → np.ndarray[INSTR_DTYPE]  ← FASTEST
        ctx.functions()            → list[FunctionSig]
        ctx.findings()             → list[Finding]
        ctx.pseudo_source()        → str
        ctx.json()                 → str
        ctx.jumpdests()            → list[int]
        ctx.risk_score()           → int
    """
    cdef HinsdaleCtx* _ptr

    def __cinit__(self):
        self._ptr = NULL

    def __dealloc__(self):
        if self._ptr != NULL:
            with nogil:
                hins_free(self._ptr)
            self._ptr = NULL

    def __enter__(self):
        return self

    def __exit__(self, *_):
        if self._ptr != NULL:
            with nogil:
                hins_free(self._ptr)
            self._ptr = NULL

    # ── Constructors ─────────────────────────────────────────────────────

    @staticmethod
    def from_bytes(data):
        """
        Analyze raw bytecode bytes. GIL released during Rust analysis.

        Parameters
        ----------
        data : bytes | bytearray | memoryview
        """
        cdef HinsdaleContext self_ = HinsdaleContext.__new__(HinsdaleContext)
        if not isinstance(data, (bytes, bytearray)):
            data = bytes(data)
        if isinstance(data, bytearray):
            data = bytes(data)
        cdef const uint8_t* ptr = <const uint8_t*>PyBytes_AS_STRING(data)
        cdef size_t n           = <size_t>PyBytes_GET_SIZE(data)
        if n == 0:
            raise ValueError("bytecode is empty")
        with nogil:
            self_._ptr = hins_analyze(ptr, n)
        if self_._ptr == NULL:
            raise RuntimeError("hins_analyze returned NULL")
        return self_

    @staticmethod
    def from_hex(str hex_str):
        """
        Analyze hex-encoded bytecode. GIL released during Rust analysis.
        Accepts '0x...' or plain hex.
        """
        cdef HinsdaleContext self_ = HinsdaleContext.__new__(HinsdaleContext)
        clean = hex_str.strip()
        if clean.startswith(('0x', '0X')):
            clean = clean[2:]
        cdef bytes enc  = clean.encode('ascii')
        cdef const char* cs = <const char*>PyBytes_AS_STRING(enc)
        cdef size_t      cl = <size_t>PyBytes_GET_SIZE(enc)
        with nogil:
            self_._ptr = hins_analyze_hex(cs, cl)
        if self_._ptr == NULL:
            raise RuntimeError("hins_analyze_hex returned NULL — invalid hex?")
        return self_

    # ── Summary ───────────────────────────────────────────────────────────

    cpdef Summary summary(self):
        """Return stats. Stack-allocated — no heap allocation in Rust or Python."""
        cdef HinsSummary s
        cdef int rc
        with nogil:
            rc = hins_summary(self._ptr, &s)
        if rc != 0:
            raise RuntimeError("hins_summary failed")
        return Summary._from_c(&s)

    # ── Instructions ─────────────────────────────────────────────────────

    cpdef list instructions(self):
        """
        Return all instructions as list[Instruction].
        Uses bulk copy into single malloc'd buffer (one syscall to Rust).
        """
        cdef uint32_t n
        with nogil:
            n = hins_instr_count(self._ptr)
        if n == 0:
            return []

        cdef HinsInstr* buf = <HinsInstr*>PyMem_Malloc(n * 128)
        if not buf:
            raise MemoryError()
        cdef uint32_t got
        try:
            with nogil:
                got = hins_instr_bulk(self._ptr, buf, n)
            result = [None] * got
            for i in range(got):
                result[i] = Instruction._from_c(&buf[i])
            return result
        finally:
            PyMem_Free(buf)

    def instructions_numpy(self):
        """
        Return all instructions as numpy structured array (shape N, dtype INSTR_DTYPE).

        ZERO-COPY path:
          1. Allocate numpy array (128*N bytes)
          2. Call hins_instr_bulk_into(ctx, arr.data, N)
             → Rust writes HinsInstr structs directly into numpy's buffer
          3. Return — no intermediate buffer, no memcpy in Python

        Fields: offset/u32, opcode/u1, imm_len/u1, stack_in/u1, stack_out/u1,
                mnemonic/S16, category/S16, imm_hex/S68, imm_u64/u8, has_imm_u64/u1
        """
        cdef uint32_t n
        with nogil:
            n = hins_instr_count(self._ptr)
        if n == 0:
            return np.empty(0, dtype=INSTR_DTYPE)

        # Allocate numpy array — Rust writes directly into this memory
        cdef np.ndarray arr = np.empty(n, dtype=INSTR_DTYPE)

        # Get raw pointer to numpy's data buffer
        cdef uint8_t* data_ptr = <uint8_t*><size_t>arr.ctypes.data

        cdef uint32_t written
        with nogil:
            written = hins_instr_bulk_into(self._ptr, data_ptr, n)

        if written < n:
            arr = arr[:written]
        return arr

    # ── Functions & findings ──────────────────────────────────────────────

    cpdef list functions(self):
        """Return list[FunctionSig]."""
        cdef uint32_t n
        with nogil:
            n = hins_fn_count(self._ptr)
        cdef list result = [None] * n
        cdef HinsFnSig sig
        for i in range(n):
            with nogil:
                hins_fn_at(self._ptr, i, &sig)
            result[i] = FunctionSig._from_c(&sig)
        return result

    cpdef list findings(self):
        """Return list[Finding]."""
        cdef uint32_t n
        with nogil:
            n = hins_finding_count(self._ptr)
        cdef list result = [None] * n
        cdef HinsFinding f
        for i in range(n):
            with nogil:
                hins_finding_at(self._ptr, i, &f)
            result[i] = Finding._from_c(&f)
        return result

    # ── Strings ───────────────────────────────────────────────────────────

    cpdef str pseudo_source(self):
        """Decompiled pseudo-Solidity. Rust allocates; freed immediately after copy."""
        cdef char* raw
        with nogil:
            raw = hins_pseudo_source(self._ptr)
        if raw == NULL:
            return ""
        try:
            return (<bytes>raw[:]).decode('utf-8', errors='replace')
        finally:
            with nogil:
                hins_free_str(raw)

    cpdef str json(self):
        """Full JSON report string."""
        cdef char* raw
        with nogil:
            raw = hins_json(self._ptr)
        if raw == NULL:
            return "{}"
        try:
            return (<bytes>raw[:]).decode('utf-8', errors='replace')
        finally:
            with nogil:
                hins_free_str(raw)

    # ── Jump destinations ─────────────────────────────────────────────────

    cpdef list jumpdests(self):
        """Return list of all JUMPDEST byte offsets."""
        cdef uint32_t cap
        with nogil:
            cap = hins_instr_count(self._ptr)   # upper bound
        cdef uint32_t* buf = <uint32_t*>PyMem_Malloc(cap * sizeof(uint32_t))
        if not buf:
            raise MemoryError()
        cdef uint32_t n
        try:
            with nogil:
                n = hins_jumpdests(self._ptr, buf, cap)
            return [buf[i] for i in range(n)]
        finally:
            PyMem_Free(buf)

    # ── Fast scalar accessors (no Summary object) ──────────────────────────

    cpdef uint32_t risk_score(self):
        cdef HinsSummary s
        with nogil: hins_summary(self._ptr, &s)
        return s.risk_score

    cpdef double elapsed_ms(self):
        cdef HinsSummary s
        with nogil: hins_summary(self._ptr, &s)
        return s.elapsed_ms

    cpdef uint32_t instruction_count(self):
        cdef uint32_t n
        with nogil: n = hins_instr_count(self._ptr)
        return n

    def __repr__(self):
        s = self.summary()
        return f"<HinsdaleContext {s.bytecode_len}b risk={s.risk_score} {s.elapsed_ms:.1f}ms>"


# ── Module-level functions ────────────────────────────────────────────────

def analyze(bytecode):
    """
    Analyze EVM bytecode. Returns HinsdaleContext.

    Parameters
    ----------
    bytecode : bytes | bytearray | str
        Raw bytes or hex string (with/without 0x).
    """
    if isinstance(bytecode, str):
        return HinsdaleContext.from_hex(bytecode)
    return HinsdaleContext.from_bytes(bytecode)


def analyze_hex(str hex_str):
    return HinsdaleContext.from_hex(hex_str)


def batch_analyze(list bytecodes):
    """
    Analyze multiple bytecodes in parallel using rayon.
    GIL released for the entire parallel section.

    Parameters
    ----------
    bytecodes : list of bytes | list of str (hex)

    Returns
    -------
    list of HinsdaleContext
    """
    cdef size_t n = len(bytecodes)
    if n == 0:
        return []

    # Normalize all inputs to bytes
    cdef list raw_list = []
    for b in bytecodes:
        if isinstance(b, str):
            clean = b.strip()
            if clean.startswith(('0x', '0X')): clean = clean[2:]
            raw_list.append(bytes.fromhex(clean))
        elif isinstance(b, bytearray):
            raw_list.append(bytes(b))
        else:
            raw_list.append(b)

    # Build BytecodeSlice array (C-level)
    cdef BytecodeSlice* slices = <BytecodeSlice*>PyMem_Malloc(n * sizeof(BytecodeSlice))
    if not slices:
        raise MemoryError()

    cdef HinsdaleCtx** out_ctxs = <HinsdaleCtx**>PyMem_Malloc(n * sizeof(HinsdaleCtx*))
    if not out_ctxs:
        PyMem_Free(slices)
        raise MemoryError()

    try:
        # Fill slice array — keep Python objects alive during the nogil section
        for i in range(n):
            slices[i].ptr = <const uint8_t*>PyBytes_AS_STRING(<bytes>raw_list[i])
            slices[i].len = <size_t>PyBytes_GET_SIZE(<bytes>raw_list[i])
        memset(out_ctxs, 0, n * sizeof(HinsdaleCtx*))

        cdef uint32_t done
        with nogil:
            done = hins_batch_analyze(slices, n, out_ctxs)

        # Wrap results in HinsdaleContext objects
        results = []
        for i in range(done):
            if out_ctxs[i] != NULL:
                ctx = HinsdaleContext.__new__(HinsdaleContext)
                (<HinsdaleContext>ctx)._ptr = out_ctxs[i]
                results.append(ctx)
        return results
    finally:
        PyMem_Free(slices)
        PyMem_Free(out_ctxs)


def stream_disasm(bytecode, uint32_t chunk_size=256):
    """
    Stream disassembly for very large bytecodes.
    Yields lists of instruction dicts in chunks.

    Parameters
    ----------
    bytecode   : bytes | str
    chunk_size : instructions per chunk (default 256)

    Yields
    ------
    list of dict  (one per chunk)
    """
    if isinstance(bytecode, str):
        clean = bytecode.strip().lstrip('0x').lstrip('0X')
        bytecode = bytes.fromhex(clean)
    elif isinstance(bytecode, bytearray):
        bytecode = bytes(bytecode)

    cdef const uint8_t* ptr = <const uint8_t*>PyBytes_AS_STRING(<bytes>bytecode)
    cdef size_t          n  = <size_t>PyBytes_GET_SIZE(<bytes>bytecode)

    cdef list all_chunks = []
    cdef StreamState state
    state.chunks = <PyObject*>all_chunks
    state.total  = 0

    # hins_stream_disasm calls _stream_callback with each chunk
    # The callback acquires GIL and appends to all_chunks
    with nogil:
        hins_stream_disasm(ptr, n, chunk_size, _stream_callback, &state)

    for chunk in all_chunks:
        yield chunk


def disasm_numpy(bytecode):
    """
    Fast disassembly — returns numpy array directly.
    Alias for: analyze(bytecode).instructions_numpy()
    """
    return analyze(bytecode).instructions_numpy()


def version():
    """Return libhinsdale version string."""
    cdef const char* v
    with nogil:
        v = hins_version()
    return (<bytes>v).decode('ascii')


def sizeof_instr():
    """Return sizeof(HinsInstr) as reported by Rust (should be 128)."""
    cdef uint32_t s
    with nogil: s = hins_sizeof_instr()
    return s


__all__ = [
    "HinsdaleContext",
    "Instruction",
    "FunctionSig",
    "Finding",
    "Summary",
    "analyze",
    "analyze_hex",
    "batch_analyze",
    "stream_disasm",
    "disasm_numpy",
    "version",
    "sizeof_instr",
    "INSTR_DTYPE",
    "INSTR_SIZE",
]
