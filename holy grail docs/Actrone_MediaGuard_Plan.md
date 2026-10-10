# Actrone MediaGuard Plan — PII Detection & Redaction Across Modalities

> **Status refreshed 2026-07-13 (code-verified):** Two internal inconsistencies in this doc are
> corrected, not the underlying facts (the facts were already right further down, just not
> reflected at the top/bottom). **(1)** The "Version 1.2" banner immediately below says "P2
> visual-PII seeded" — that undersells it; the doc's own §-level entries (search "P2 — Visual PII"
> and "P3 — Optimisation & frontier") already say **✅ SHIPPED 2026-06-28** for both P2 and P3, and
> this pass re-confirmed it against code: `backend/mediaguard/src/mediaguard/engines/visual.py`
> (YuNet CPU-default face detector), `yolo_face.py` (`OnnxYoloFaceDetector` — YOLOv8-face/ONNX
> accuracy tier, real decode/NMS logic, not a stub), and `vlm_ocr.py` (VLM-OCR accuracy tier) all
> exist as substantial, real implementations (10-13 KB each), wired through a tiered
> `service.py` that degrades gracefully when the `[ml]` extra or a model is unavailable. **(2)**
> The document footer at the very bottom still reads "Last updated: 2026-06-18 | ... | Status:
> Planning" — that predates every SHIPPED milestone in this doc and directly contradicts them;
> corrected below. Net effect: this doc's own P2/P3 SHIPPED claims (2026-06-28) are accurate and
> code-confirmed; only the top banner and bottom footer hadn't caught up. The "remaining" gate is
> still what P2/P3's own entries already say: deploy-only (model weights baked/available + a
> configured VLM OCR endpoint), not a code gap.
>
> **Version 1.2 — June 2026 · P1 COMPLETE 2026-06-26 — orchestrator core (in-process) + the self-hosted `mediaguard` service (Presidio + PaddleOCR + GLiNER, CPU-only) both SHIPPED & tested; P2 visual-PII seeded** *(superseded by the P2/P3 SHIPPED entries later in this doc — see the refreshed status note above)*

> **P1 service status (2026-06-26):** the external `mediaguard` service is built at `backend/mediaguard/`
> and is **CPU-only — no GPU required** (PaddleOCR/Presidio/GLiNER are GPU-*accelerated*, not
> GPU-*dependent*; the service installs the `paddlepaddle` CPU wheel + onnxruntime CPU). Architecture:
> a pure verdict engine + detection behind narrow engine Protocols, so a **deterministic tier**
> (lossless metadata strip · pypdfium2 PDF text-layer fast path · regex PII mirroring MAL · Pillow box
> redaction · Redis result cache · FastAPI `/v1/scan` + health + metrics) and a **heavy ML tier**
> (Presidio+GLiNER NER · PaddleOCR PP-OCRv5 · OpenCV face detection, behind the `[ml]` extra) are
> interchangeable. The Go orchestrator reaches it via a `RemoteDetector` (circuit breaker + retry +
> timeout) that implements the same `Detector` seam — config-gated on `ORCHESTRATOR_EMAOP_MEDIAGUARD_URL`,
> default in-process. A detector error fails the Go Engine closed (block). Transport is HTTP/JSON
> (identical message shapes to the plan's gRPC sketch; no protoc dependency).
>
> **What was tested, and where (honest):** the **30 unit+eval tests** (verdict banding, metadata
> strip, redactor, cache, pipeline OCR→PII→redact, FastAPI, false-negative SLO) pass CPU-only in
> three places — locally (3.14), in a clean `python:3.12` Linux container, **and inside the full ML
> image** (with torch/paddlepaddle/paddleocr/presidio/spaCy/gliner all installed). The heavy ML
> **install** is verified (stepwise cached layers + CPU torch + spaCy `en_core_web_sm`). The
> Go side (engine, in-process + **remote** detectors with retry/fail-closed, config, service,
> workflow) is fully green. The **ML *integration* tests** (which invoke the real models) are gated
> to **CI** (`backend/.github/workflows/ci-mediaguard.yml`): they could not be executed in the build
> sandbox because its network **stalls on the model-weight downloads** (the same constraint that
> timed out PyPI wheels) — an environment limit, not a code issue. The Dockerfile now bakes the
> GLiNER + PaddleOCR weights into the image at build time, so CI (and any normal-bandwidth host) runs
> the integration suite without a runtime download. **No GPU anywhere.**
>
> **Remaining:** higher-accuracy visual PII (RetinaFace/YOLOv8-face, signatures — P2), the VLM OCR
> accuracy tier (PaddleOCR-VL/dots.ocr — P3), rasterised-scanned-PDF OCR, and growing the labelled
> eval set on Actrone's own data (the SLO discipline). The GPU node pool is a throughput lever, not a
> correctness gate.

**Version 1.1 — June 2026 · P1 orchestrator core SHIPPED 2026-06-26 (in-process tier, dormant by default); external OCR/ML service + visual PII pending**

> **P1 status (verified 2026-06-26; `go build ./...` + mediaguard/service/workflow/domain suites green):**
> The governed orchestrator half of P1 is built and wired, dormant by default. New package
> `internal/mediaguard` holds the governance core: a fail-closed **`Engine`** (verdict→action
> banding — pass / redacted / block / escalate — with findings filtered by a confidence floor and a
> fail-closed block whenever a scan cannot complete), a pluggable **`Detector`** seam, and the
> default zero-egress **`InProcessDetector`** that does the dependency-free subset — surgical,
> lossless **EXIF/metadata stripping** (JPEG APPn/COM segments + PNG ancillary text/eXIf chunks) and
> **MAL-classifier reuse** over any text layer (identical PII detection to the prompt path, via a
> narrow `TextClassifier` seam — no new dependency). Findings are MAL-safe (entity types + counts +
> confidence, never the raw value).
>
> Wired as **Activity 0.5** in `AgentTaskWorkflow` (after Agent-File validation so the policy is
> known, before routing/the model so the provider only sees sanitised media): `GetVersion`-gated
> AND scheduled only when the agent enables `media_governance` (new optional `MediaGovernanceSpec`
> on `AgentSpec.Governance`, pointer ⇒ absent = OFF), so every existing agent and history replays
> byte-for-byte. The activity (`ActivityService.MediaGuard`) parses the same `images`/`documents`
> arrays the multimodal path consumes, runs the engine, and on a redacted verdict rewrites the task
> input with cleaned base64 bytes; block → `ERR_GOVERNANCE_BLOCK`, escalate → the existing Tier-3
> escalation pause. Default in-process detector built when EMAOP is enabled; the external service
> plugs into the same `Detector` seam.
>
> **Remaining for full P1 + beyond:** the self-hosted Python `mediaguard` service (Presidio +
> PP-OCRv5 + GLiNER) reached over gRPC — OCR of raster images and the PDF text-layer fast path —
> plus the Redis result cache and the labelled eval set (§6, the false-negative SLO). The in-process
> tier delivers metadata hygiene + text-layer classification today; deep OCR/visual-PII (P2) is the
> external service. This split is honest: the Go core ships and is verified; the GPU/accuracy half
> needs a cluster + eval run that cannot be validated from the build environment.

**Version 1.0 — June 2026 · Planning (closes the multimodal MAL gap)**

> The multimodal input path (P6-E Wave 3, Slice 3.3) lets agents send images and PDFs to
> vision-capable models. The text prompt is MAL-tokenised, but **binary media bytes pass to the
> provider unmodified** — PII baked into a screenshot, a scanned ID, or a photographed form is
> currently invisible to governance. **MediaGuard** closes that gap: a self-hosted detector that
> finds and redacts PII *inside* media before any provider sees it. Extends the
> [Master Plan](./Actrone_Master_Implementation_Plan.md) (P6-E Wave 3), reuses MAL, the DPE block
> path, the Tier-3 escalation queue, and the audit spine.

---

## 0. The governing constraint

**The detector must run self-hosted, in-cluster, with zero third-party egress.**

This one rule shapes every choice below. MAL exists so sensitive data does not leave the tenant
boundary un-tokenised; sending an image to a managed OCR/PII API (AWS Textract, GCP Vision, Azure
AI) to "protect" it is self-defeating — it *is* the egress we guard against. So every engine here
is open-source, commercially licensed, and runs on Actrone's own nodes. This is not a limitation;
it is the differentiator — **governed multimodal that never phones home**.

A second rule governs accuracy: **false negatives are the dangerous failure**. A missed redaction
leaks PII to the provider; an over-redaction merely loses some context. So defaults are
conservative and strict policies **fail closed**.

---

## 1. Where it sits in the pipeline

MediaGuard is a new governed step, **Activity 0.5**, between MAL tokenisation (Activity 0) and the
rest of the durable workflow — the same shape as `MALTokenise`, so media is sanitised before any
downstream activity or the model sees it.

```
Activity 0    MALTokenise        — tokenise sensitive TEXT fields (exists)
Activity 0.5  MediaGuard         — scan + redact PII in images/PDFs (NEW, policy-gated)
Activity 1    ValidateAgentFile  …
Activity 3    RouteModel         — vision-capable routing (exists, Wave 2)
Activity 4    StreamLLMResponse  — provider sees only redacted media
```

- **Gated by policy.** Default OFF — only agents that handle media *and* require governance pay the
  cost. Secure-default ON for HIPAA / GDPR / financial policy bundles.
- **GetVersion-gated** like every workflow change, so in-flight histories replay deterministically.
- On a non-`pass` verdict it rewrites the task input's `images`/`documents` with redacted bytes
  (redact), or blocks (DPE block path), or pauses for approval (escalation queue) — no new
  governance primitives.

---

## 2. Architecture — a `MediaGuard` service + a Go seam

The best-of-breed OCR / PII / vision stack (Presidio, PaddleOCR, OpenCV, torch) is Python and needs
GPU plus heavy dependencies that do not belong in the Go orchestrator binary. So MediaGuard is its
own service, consistent with Actrone's service-per-domain architecture.

| Component | Language | Responsibility |
|---|---|---|
| **`mal.MediaDetector`** interface + gRPC client | Go (orchestrator) | the seam; circuit breaker, timeout, retry-with-jitter (CLAUDE.md §4.4) |
| **`MediaGuard` activity** (Activity 0.5) | Go (orchestrator) | policy gate, cache lookup, apply verdict to input, audit |
| **`mediaguard` service** | Python (FastAPI + gRPC) | OCR → PII NER → visual detection → redaction; owns the models |
| GPU node pool + Redis result cache | infra | scaling + dedupe |

The Go orchestrator never imports a vision dependency; it speaks gRPC to `mediaguard`. The service
runs in-cluster on GPU nodes, behind the mesh (mTLS), reachable only from the orchestrator.

### 2.1 gRPC contract (sketch)

```proto
service MediaGuard {
  rpc ScanMedia(ScanRequest) returns (ScanResponse);
}

message MediaInput {
  string id = 1;            // caller-assigned (maps back to the input array index)
  string media_type = 2;    // image/png | application/pdf | …
  bytes  data = 3;          // raw bytes (base64-decoded by the caller)
  string url = 4;           // OR an https source the service fetches in-cluster only
}

message ScanRequest {
  string tenant_id = 1;
  string task_id = 2;
  repeated MediaInput items = 3;
  MediaPolicy policy = 4;   // detectors, action, min_confidence, strip_metadata
}

message Finding {
  string item_id = 1;
  string entity_type = 2;   // PERSON | US_SSN | CREDIT_CARD | FACE | …  (TYPE only, never the value)
  float  confidence = 3;
  BoundingBox box = 4;
}

message ScanResponse {
  string verdict = 1;             // pass | redacted | block | escalate
  repeated Finding findings = 2;  // types + counts + boxes, MAL-safe (no raw PII)
  repeated MediaInput redacted = 3; // sanitised bytes when verdict = redacted
}
```

The response carries **entity types, counts, confidences, and bounding boxes — never the raw PII
value** — so the audit row and any log line stay MAL-safe.

---

## 3. The detection pipeline (tiered — cheap → expensive, short-circuit)

Each stage can resolve the item and skip the rest, so the common cases stay fast.

1. **Admit & cache.** SHA-256 each item → per-tenant Redis result cache. A re-sent image skips all
   work (idempotent, the biggest single perf win). Decode/validate format. **Strip EXIF/metadata
   always** — it carries GPS and device PII and costs nothing.
2. **Text extraction (cheapest first).** A PDF with a text layer → extract directly (pypdfium2):
   exact, fast, no OCR error. An image or scanned PDF → OCR (engine tiers in §4).
3. **Text PII.** Run extracted text through **Presidio Analyzer** with a **GLiNER** recognizer +
   Actrone's existing canonical regexes (SSN, card, IBAN, email, phone) as custom recognizers — so
   detection is identical across text and media. Output: entity type, span, **bounding box**,
   confidence.
4. **Visual PII (policy-gated, heavier).** Face / signature / stamp detection → bounding boxes. Runs
   only when the policy enables biometric scanning.
5. **Act (§5).**
6. **Audit (§7).**

---

## 4. Engine choices (SOTA-verified, June 2026)

Verified against current benchmarks and licences. All self-hostable; all commercially licensed
except where flagged.

| Concern | Pick | Licence | Why |
|---|---|---|---|
| **Framework / spine** | **Microsoft Presidio** (Analyzer + Image Redactor) | MIT | Purpose-built for PII detect/redact across **text + images + DICOM**; now ships a `GLiNERRecognizer`, GPU acceleration (4–10×), ONNX runtime, batch REST, multi-arch Docker. MediaGuard integrates and configures it rather than building a pipeline from scratch. |
| **OCR — fast tier** | **PP-OCRv5** (PaddleOCR 3.0) | Apache-2.0 | 5M-param, ~370 chars/s on CPU, tens of ms on a T4 GPU, 100+ languages, rivals billion-param VLMs on clean text. The default inline workhorse. |
| **OCR — accuracy tier** | **PaddleOCR-VL** (alt: dots.ocr) | Apache-2.0 | VLM OCR: **3–4× lower character error rate on noisy scans, receipts, handwriting** — exactly the high-PII-risk inputs. GPU-bound; reserved for strict/high-assurance policy, not every image. |
| **PII NER** | **GLiNER-PII** (alt: DeBERTa fine-tuned on ai4privacy) | model-dependent ⚠️ | GLiNER: zero-shot, BERT-base-sized, quantized-ONNX, 55–60+ PII/PHI types. DeBERTa-ai4privacy reaches F1 0.976 on a fixed entity set when max accuracy is needed. Both run behind Presidio's `GLiNERRecognizer`. |
| **PDF text layer** | **pypdfium2 / pdfplumber** | Apache / MIT | Skips OCR entirely for digital PDFs — fastest and exact. |
| **Face / visual** | Presidio Image Redactor (P1) → **RetinaFace / YOLOv8-face** (P2) | varies | Lightweight, accurate; runs only when policy enables biometric scanning. |
| **Image manipulation** | **OpenCV / Pillow** | Apache / HPND | Draw opaque boxes / blur over detected boxes, re-encode. |

**Open item before lock-in:** GLiNER weights vary by published variant in their licence; select an
Apache/MIT-licensed GLiNER-PII checkpoint (or default to DeBERTa-ai4privacy) and confirm it on the
eval set (§6). Everything else is licence-clean.

---

## 5. Actions & governance policy — redaction is the image-world "tokenisation"

A blurred pixel region cannot be detokenised, so **media is one-way redacted** — and that is fine,
because the model never needed the raw PII. Where OCR'd text is *also* surfaced to the model as
text, those spans are reversibly MAL-tokenised (consistent with the text path). Action is banded by
policy and confidence:

| Action | When | Mechanism |
|---|---|---|
| **redact** (default) | PII found, standard assurance | black-box / blur the detected boxes, re-encode, send the clean media |
| **block** | strict policy + high-confidence PII | fail-closed via the existing **DPE block path** (`ERR_GOVERNANCE_BLOCK`) |
| **escalate** | medium confidence, sensitive doc type | **reuse the Tier-3 escalation queue** — "this looks like a passport; approve sending?" |
| **pass** | low assurance / nothing found | audit only, send as-is |

Policy on the Agent-File / governance bundle:

```yaml
spec:
  governance:
    media_governance:
      enabled: true                 # default false — only media+governed agents pay the cost
      detectors: [ocr_text_pii, faces, signatures]
      action: redact                # redact | block | escalate
      min_confidence: 0.6
      strip_metadata: true
```

Secure defaults: the HIPAA / GDPR / financial policy bundles ship `enabled: true` with
`action: redact` (or `escalate` for the strictest) so compliance-bound tenants are protected without
hand-configuration.

---

## 6. Accuracy & evaluation (false-negative-first)

- **Labelled eval set** — synthetic IDs, passports, bank statements, medical forms, faces, plus
  clean negatives — checked into the repo. Precision/recall tracked in CI; **the false-negative
  rate is the SLO that matters** and gates merges.
- **Confidence bands drive actions** — high → redact/block; medium → escalate; low → annotate — so
  uncertainty routes to a human via the existing queue rather than silently passing.
- **Fail-closed** for strict policies: any detector error, timeout, or service-unavailable on a
  strict-policy task blocks or escalates the task rather than sending unscanned media.
- **Per-domain caveat** (verified): general PII models lose accuracy on clinical text — so the
  healthcare policy bundle enables Presidio's `MedicalNERRecognizer`/PHI recognizers, and the eval
  set includes a clinical split.

---

## 7. Audit

Findings feed the audit spine's `TokenisationStep` (extended to cover media): entity **types**,
counts, confidences, the action taken, and per-item cache hit/miss — **never the raw PII value**.
This makes "what sensitive content did this agent send, and what did we do about it?" a queryable,
tamper-evident record, consistent with how text MAL decisions are already audited.

---

## 8. Performance & scale

- **Tiered short-circuit** (§3) + **Redis hash cache** keep the common path cheap; re-sent media is
  effectively free.
- **In-service concurrency** — `asyncio.gather` + a `Semaphore` bound per request; **GPU batching**
  across items; models loaded once as singletons and **pre-warmed at startup**.
- **Bounded everywhere** — per-item timeout, max payload caps (already enforced at ingestion: 20
  images / 5 docs / ~22 MB each), circuit breaker + retry-with-jitter on the Go gRPC client.
- **Scale** — dedicated GPU node pool, HPA on queue depth; the fast tier (PP-OCRv5) can run CPU-only
  for cost-sensitive / GPU-unavailable deployments, with the VLM tier on GPU.

---

## 9. Phasing

- **P1 — Text-PII in media (the ~80% of risk).**
  - **✅ SHIPPED (orchestrator core, 2026-06-26):** `internal/mediaguard` Engine + Detector seam +
    in-process detector (lossless metadata strip + MAL-classifier text seam); `media_governance`
    policy gate on `AgentSpec.Governance`; **Activity 0.5** wired into `AgentTaskWorkflow`
    (`GetVersion`-gated, scheduled only when enabled); redact/block/escalate verdict enforcement
    (block→`ERR_GOVERNANCE_BLOCK`, escalate→Tier-3 pause); input rewrite with sanitised bytes.
  - **✅ SHIPPED (self-hosted service, 2026-06-26):** `backend/mediaguard/` — Presidio Analyzer +
    **RapidOCR / PP-OCRv6 via onnxruntime** OCR + **GLiNER** NER + Actrone regexes, the pypdfium2 PDF
    text-layer fast path, the Pillow box redactor, the Redis result cache, and the labelled eval set —
    all CPU-only, behind the Go `RemoteDetector` on the same Detector seam. Covers screenshots and
    digital PDFs. (OCR runs the PP-OCR models through onnxruntime, not paddlepaddle — portable/stable
    on any CPU, zero-egress models bundled in the wheel; see §4. The paddle server tier is opt-in P3.)
  - **✅ SHIPPED (scanned-PDF OCR, 2026-06-28):** an image-only/scanned PDF (no usable text layer) is
    rasterised page-by-page (`pdf_text.rasterise_pdf_pages`, pypdfium2 @ ~180 dpi, page-capped) and
    routed through OCR, so PII inside scanned contracts/IDs is detected. Detection-only (a PDF is not
    redacted in place → a redact-policy PDF with PII fail-closed blocks). Real-model + deterministic
    tests green (`test_scanned_pdf_ocr_detects_pii`, `test_scanned_pdf_is_rasterised_and_ocred`).
  - **✅ SHIPPED (eval growth, 2026-06-28):** the labelled set grew to 23 positives (SSN, cards,
    emails, IBANs, phones, money — varied real-world formats) + 12 clean negatives, and a **Presidio
    (ML-tier) recall gate** now enforces the same ≤5 % false-negative SLO as the regex tier on the
    entities Presidio detects deterministically (`test_presidio_eval`), with naming bridged
    (`EMAIL`↔`EMAIL_ADDRESS`, etc.). Both tiers green.
  - **Pending:** labelling a held-out eval set on **real tenant data** (the synthetic set above gates
    regressions today; real-data calibration is the remaining hardening).
- **P2 — Visual PII. ✅ SHIPPED 2026-06-28** (`backend/mediaguard/engines/visual.py`).
  - **Faces** — `YuNetFaceDetector` (a compact CNN run through OpenCV's *built-in* ONNX/DNN backend
    — no torch, no onnxruntime; ~230 KB Apache-2.0 weight baked into the image and functionally
    validated at build), degrading to `HaarFaceDetector` (OpenCV-bundled cascade, no download) when
    the weight is absent. YuNet replaces the plan's RetinaFace/YOLOv8-face as the **CPU-optimal,
    locally-verifiable** default — the same portability logic that put OCR on onnxruntime instead of
    paddle.
  - **Faces — accuracy tier ✅ SHIPPED 2026-06-28** (`engines/yolo_face.py`): `OnnxYoloFaceDetector`,
    a **YOLOv8-face ONNX model via onnxruntime** (the plan's RetinaFace/YOLOv8-face), behind the same
    `detect(bytes)` seam — `visual_tier="accuracy"` selects it, with conservative fallback to
    YuNet→Haar when the weight is absent. The numeric post-processing is split into pure functions
    (`to_detections`/`decode_yolov8_face`/`scale_boxes`) so the decode is unit-tested against
    synthetic tensors without a model. The weight is **operator-supplied** (a `--build-arg
    YOLOV8_FACE_URL=…`; no dubious default URL is hardcoded), validated through onnxruntime at build.
  - **Signatures** — `SignatureDetector`, a classical-CV heuristic (Otsu threshold → wide
    morphological close → contour isoperimetric-complexity filter; no model, no download). Favours
    recall (over-redaction is the safe failure per §0). A fine-tuned YOLOv8-signature model is the
    future accuracy tier on the same seam.
  - **Composite + gating** — `CompositeVisualDetector` runs ONLY the biometric detectors the policy
    enables (`faces` / `signatures`), isolates a faulting sub-detector, and only runs on rasters.
    Findings feed the existing redact/block/escalate banding and the Pillow box redactor.
  - **GPU seam ✅ SHIPPED 2026-06-28** (closes "no GPU config exists"): a `MEDIAGUARD_DEVICE=cpu|cuda`
    setting threads to RapidOCR (onnxruntime CUDA execution provider, CPU-safe fallback), GLiNER
    (torch `map_location`, retried without the kwarg on older presidio), and YOLOv8-face (CUDA EP);
    a `--build-arg DEVICE=gpu` Dockerfile variant swaps to CUDA torch + `onnxruntime-gpu`. CPU stays
    the default verified path; YuNet/signature/regex/metadata ignore device and stay CPU. See §8.
  - **Verified locally (real OpenCV + onnxruntime):** unit 47 passed (composite gating + fault
    isolation + pipeline visual path + device/tier config validation); integration green —
    `test_signature_detector_*`, `test_haar_face_detector_*`,
    `test_visual_pipeline_redacts_a_signature_end_to_end`, the YOLOv8 decode/letterbox math, and the
    **full `OnnxYoloFaceDetector` inference wiring through onnxruntime against a synthetic
    YOLOv8-shaped model** (planted face → correct scaled box, NMS, Finding). The real YuNet weight
    downloads/constructs/infers. The real-trained-YOLOv8 run is skip-guarded (no model in the repo)
    and the **GPU path is unverifiable in this sandbox** (no GPU) — it is CI / GPU-node gated.
- **P3 — Optimisation & frontier. ✅ SHIPPED 2026-06-28** — all five sub-items built.
  - **VLM accuracy OCR tier** (`engines/vlm_ocr.py`): `VlmOcrEngine`, a governed client to the
    operator's OWN in-cluster GPU model server (PaddleOCR-VL / dots.ocr) exposing an
    **OpenAI-compatible** vision endpoint. **Zero third-party egress is structural** — there is no
    default URL (an unset tier disables itself → RapidOCR fallback), the key is a `SecretStr` (never
    logged), and every call has a timeout + bounded retries (backoff+jitter) + a circuit breaker;
    persistent failure raises `VlmUnavailable` → the scan **fails closed** (block). Selected by
    `ocr_tier="accuracy"`. Pure `build_vlm_request`/`parse_vlm_response` (structured `{text,box}`
    regions, with a prose fallback → whole-image redaction box, the safe failure).
  - **Tesseract CPU bulk tier** (`engines/tesseract_ocr.py`): `TesseractOcrEngine` (word boxes via
    `image_to_data`), the ultra-fast low-assurance throughput tier; `ocr_tier="bulk"`; needs the
    `tesseract-ocr` system binary (installed in the image).
  - **Quantised models** (`yolo_face.build_session_options`): onnxruntime full graph optimisation +
    a pinned intra-op thread cap; `quantized` + `onnx_intra_op_threads` settings; an operator-supplied
    INT8 weight at the model path is what quantises the model.
  - **GPU batching** (§8): true tensor batching — `OnnxYoloFaceDetector.detect_batch` stacks one
    input tensor; `CompositeVisualDetector.detect_batch` batches faces; the pipeline runs a **batched
    visual pre-pass** across a request's raster items; the VLM tier fans out bounded-concurrent
    requests (`recognise_batch`). Bounded by `ocr_max_batch` / `scan_concurrency`.
  - **Per-tenant recogniser tuning** (`engines/custom.py`): a policy carries `custom_recognizers`
    (entity/regex/score) merged with the built-in analyzers per request (ReDoS-bounded: capped
    pattern length, scanned text, and match count). Wired through the API schema.
  - **OCR tier dispatch** generalised into a `_OCR_TIER_BUILDERS` registry; every tier falls back to
    RapidOCR so the service is never left without OCR. The `MEDIAGUARD_DEVICE` GPU seam (P2) plumbs
    into RapidOCR/GLiNER/YOLOv8/VLM.
  - **Verified locally:** unit 73 passed (VLM request/parse + mock-transport incl. 4xx/5xx fail-closed
    + batch; Tesseract parse; custom recognisers incl. pipeline merge + invalid-pattern + ReDoS
    guards; batching orchestration incl. batched-visual-once + concurrent==sequential; tier/device/
    quantisation config validation). Integration green where runnable (onnxruntime session options;
    YOLOv8 batched inference via the synthetic-model harness). **CI/GPU-gated (NOT run here):** the
    real PaddleOCR-VL/dots.ocr server, the real `tesseract-ocr` binary (skip-guarded), the real
    YOLOv8 weight, and ALL GPU/CUDA execution — this sandbox has no GPU and cannot download the
    server-class models.

---

## 10. Why this is efficient and low-risk

It slots onto primitives that already exist — the **escalation queue**, the **DPE block path**, the
audit spine's **tokenisation step**, MAL's **regex set**, the Wave-2 **vision routing**, and the
Wave-3 ingestion **caps/validation**. The genuinely new surface is one Python service (largely
configured Presidio + PaddleOCR, not a from-scratch pipeline) and one governed activity. The hardest
part is not code — it is the **eval discipline** (§6): proving the false-negative rate is low enough
to trust, on Actrone's own data, before any tenant relies on it.

---

**Dependencies:** P6-A/C (worker pools + GPU node pool, infra repo) for the service runtime; the
existing escalation queue (P5-A) and DPE block path. **Sequence:** after the current Wave 3 item
(Bedrock adapter) or in parallel, since it touches a disjoint surface.

Last updated: 2026-06-28 (body) / 2026-07-13 (status-refresh note only) | Owner: Matt | Status: P1–P3 SHIPPED (code-verified 2026-07-13); this footer previously read "Status: Planning" and was stale — it predated every milestone recorded in this document.
