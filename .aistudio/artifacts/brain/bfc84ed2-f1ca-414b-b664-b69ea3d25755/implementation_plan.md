# Implementation Plan: Advanced 99.99% Comment Parsing Engine & Precision Allocation

## 1. Executive Summary
Based on deep analysis of over 1,700 real live-stream customer comments from Kari Arnett Facebook Live sales, we have identified key edge-cases that cause false extractions or missed orders. This plan introduces a multi-stage parser architecture designed to reach **99.99% accuracy**, eliminating noise from street numbers, prices, body weights, multi-code chains, and conversational inquiries.

---

## 2. Real-World Patterns & Root Causes Identified

### A. Chained Multi-Product Orders in Single Comments
- **Pattern Examples**:
  - `92»1»99»1»102»1` (uses French guillemets `»`)
  - `12យក1-13យក1` or `12យក1_13យក1`
  - `១២យក១អិល..១៣យក.១` (Khmer numerals + English sizes)
  - `74.1+77 1` or `76=10 \n 78=20`
- **Issue**: Standard single-code extractors only catch the first code or misinterpret subsequent codes as quantities.
- **Solution**: Multi-segment splitter recognizing `»`, `+`, `-`, `_`, `\n`, `និង`, and repetitive `យក`/`កូដ` markers.

### B. Price & Dollar Token Interference
- **Pattern Examples**:
  - `ថែម 74-1=2.50` (`=2.50` is $2.50, not qty 2 or code 50)
  - `110 យក1 =2.5$` (`=2.5$` is price)
  - `53=3$យកពី` (`3$` is price $3, `យកពី` is qty 2)
  - `110 យក1 =2.5$`
- **Solution**: Pre-filter price regex `[=:]?\s*\$?\d+(?:\.\d{1,2})?\s*(?:\$|ដុល្លារ|រៀល|៛)` before parsing quantities.

### C. Address & Landmark Numbers (Streets, Borey Projects)
- **Pattern Examples**:
  - `ផ្លូវ 2004` (Street 2004) in `២០យក៣០៨៨៦៤០២៤១១ផ្លូវ 2004` (Must NOT extract 2004!)
  - `គំរោង 19 ផ្លូវទី 2 ផ្ទះលេខ C13` in `(កូត110=3)093716863 កប់ស្រូវ​សង្កាត់​ស្នោ​បុរី​ម៉នដានី​គំរោង​19​ផ្លូវទី​2​ផ្ទះលេខ​C13​`
  - `គីឡូ9` (Kilometer 9 landmark, not body weight or code)
- **Solution**: Dedicated address stripper covering `ផ្លូវ(?:\s*លេខ|\s*ទី)?\s*\d+`, `គំរោង\s*\d+`, `ផ្ទះលេខ\s*[A-Z0-9]+`, and `គីឡូ\s*\d+\s*(?:ដីថ្មី|ផ្សារ|សង្កាត់|ភូមិ)`.

### D. Weight & Typo Normalization
- **Pattern Examples**:
  - Typo `គឺទូ៥៦` for `គឺឡូ 56`
  - `gk65` for `kg 65`
  - `127គ65` (`គ65` = `គីឡូ 65`)
  - `30=80kg` (`80kg` is weight, qty is default 1)
  - `157គីឡូ 65 ពណ៌ខ្មៅ`
- **Solution**: Extended Khmer weight lexicon supporting `គឺទូ`, `គ\d+`, `gk\d+`, `kg\d+`.

### E. Inquiries & Confirmation Comments (Zero Product Orders)
- **Pattern Examples**:
  - `កុងកុំឮងមើល` / `កុងកុឮងមើល`
  - `បងមានអាវសប្រុស90kgអត់`
  - `ពាក់បានដល់ម៉ានគីឡូបង` / `ពាកបានមានកិឡូ`
  - `38ពាក់ដល់មាណគីឡូបង` (Asking about 38, not ordering 38!)
  - `ចែ 110 មិញបានអត់` (Confirmation check, not new order)
  - `បើ15 អត់បានដាក់16ក៏បានដែលបង` (Conditional inquiry)
  - `លើខ្លួនមួយឆុតបង` / `ពេលខ្លួនបងមួយឈុតប៉ុន្មាន`
- **Solution**: Enhanced Intent Classifier that marks comment as strictly `Inquiry` when question markers or past-tense confirmation words (`បានអត់`, `អស់នៅ`, `លក់មិច`, `ប៉ុន្មាន`, `បើ...ក៏បាន`) dominate.

---

## 3. Architecture & Implementation Steps

```
Raw Comment
    │
    ▼
1. Address & Phone Sanitization (Strip 012..., ផ្លូវ 2004, គំរោង 19, ផ្ទះ C13)
    │
    ▼
2. Price & Dollar Stripping (Strip =2.50, =2.5$, 3$, etc.)
    │
    ▼
3. Inquiry & Conversational Guard (Detect questions, inquiries, zero extraction)
    │
    ▼
4. Weight & Measurement Extraction (Extract គឺឡូ, គឺទូ, gk, kg, ចង្កេះ -> store in note)
    │
    ▼
5. Multi-Chain Splitting (Split on », +, _, -, newline, commas between pairs)
    │
    ▼
6. Code & Qty Extraction + Catalog Validation
    │
    ▼
Precision Allocated Items (99.99% Confidence)
```

### Phase 1: Regex & Normalization Engine Hardening
- Implement `stripPricesAndCurrencies(text: string)` to sanitize price tags like `=2.50`, `=2.5$`, `3$`.
- Expand address cleaner to strip `ផ្លូវ\s*\d+`, `ផ្លូវទី\s*\d+`, `គំរោង\s*\d+`, `ផ្ទះលេខ\s*\w+`.
- Add typo handlers for weight (`គឺទូ`, `គ\d+`, `gk\d+`, `k\d+`).
- Add inquiry filters for confirmation questions (`...មិញបានអត់`, `...ពាក់បានគីឡូប៉ុន្មាន`).

### Phase 2: Multi-Item Chaining Parser
- Support chained order formats:
  - `92»1»99»1»102»1` -> `[{code: '92', qty: 1}, {code: '99', qty: 1}, {code: '102', qty: 1}]`
  - `12យក1-13យក1` -> `[{code: '12', qty: 1}, {code: '13', qty: 1}]`
  - `76=10\n78=20` -> `[{code: '76', qty: 10}, {code: '78', qty: 20}]`
- Support size distribution notation:
  - `3=3SmL` -> `[{code: '3', qty: 3, note: 'S, M, L'}]`
  - `6 យក 4 M2 L2` -> `[{code: '6', qty: 4, note: 'M2, L2'}]`
  - `87 (29 )31(1))` -> `[{code: '87', qty: 2, note: 'size 29, 31'}]`

### Phase 3: Server-side Database & Webhook Synchronization
- Sync server-side parser in `/server/parser.ts` with `/src/utils/commentParser.ts` to ensure 100% parity between client optimistic parsing and backend storage.
- Update `/server/db.ts` to prevent false items when streaming comments come in.

### Phase 4: Full 1,700-Comment Automated Test Suite
- Create an automated test runner script `scripts/verify-real-stream-comments.ts` loaded with the exact comments provided by the user.
- Verify 0 false extractions on inquiries and 100% accurate extractions on real orders.

---

## 4. Verification & Validation Metrics

| Test Category | Target Accuracy |
| :--- | :--- |
| Chained Code Detection (`»`, `+`, `_`, `-`) | 100% |
| Price Tag Rejection (`=2.50`, `=2.5$`) | 100% |
| Street/Address Disambiguation (`ផ្លូវ 2004`, `គំរោង 19`) | 100% |
| Weight Extraction vs Product Code | 100% |
| Inquiries & Conversational Questions Ignored | 100% |

---

## 5. Next Steps
Upon your review and approval (click **Proceed**), we will immediately implement the updated parsing modules and run the comprehensive test suite across all user comments.
