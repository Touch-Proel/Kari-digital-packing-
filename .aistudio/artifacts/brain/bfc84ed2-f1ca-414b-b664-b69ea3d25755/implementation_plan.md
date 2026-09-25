# Comment Parser Logic Enhancement (Direct Parser Improvement)

Targeted upgrade to the existing Live Comment Parsing Logic (`src/utils/commentParser.ts` & `server/parser.ts`) to handle all missing syntax patterns and edge cases identified in the real-world dataset, verified with comprehensive test cases in `scripts/test-parser-suite.ts`.

---

## User Review & Critical Decisions

> [!NOTE]
> Focused purely on enhancing the existing parser logic without unnecessary UI bloat, ensuring all real-world customer commenting formats parse accurately.

### Missing Parsing Patterns to Add:
1. **New Delimiters**:
   - `»` (e.g. `37»5`, `52»2`, `54»1`)
   - `)` & `()` (e.g. `11)1`, `33()1`, `81)1`, `103)2`, `125)1`, `133)=1`)
   - `:` & `;` (e.g. `054:3`, `55:4`, `56:3`, `57:5`, `11:3`, `15:5`, `24:3`, `27;3`, `30:2`, `33:3`, `54:3`, `62:3`, `63:5`, `79:3sml`, `82:4`, `93:5`, `109:3`, `110:3`, `113:5`)
   - `""` quotes (e.g. `74""2""`)
   - `-` with quantity or size (e.g. `72-2`, `75-1`, `82-1`, `113-1`, `115-1`, `137-1`, `140-1`)
   - `_` underscore delimiter (e.g. `68_2`, `107_2`, `110_1`, `115_1`, `123_1`, `125_5`, `128_1`, `133_1`, `137_3`, `139_2`, `140_2`, `156_1`)
   - `+` plus delimiter (e.g. `89+1`, `113+1`)
   - `.` period with quantity (e.g. `12. 3`, `13. 5`, `41.2`, `59.1`, `60.2`, `69.1`, `70.1`, `71.1`, `102.2`, `107.1`, `108.2`, `113.1`, `114.1`)
2. **Khmer Number Words & Units**:
   - Quantities in Khmer words: `មួយ` (1), `ពីរ` (2), `បី` (3), `បួន` (4), `ប្រាំ` (5), `ដប់` (10), `ម្ភៃ` (20)
   - Product unit words: `ឈុត` / `ឆុត` (sets), `អាវ` (shirts), `ខោ` (pants), `រ៉ូប` (dresses), `កញ្ចប់` (packs), `ក្បាល` (pieces), `ពណ៌` / `ពណ៍` (colors)
   - Emoji separators: e.g. `24,💝១` -> Code 24, Qty 1
3. **Multi-Item Comments in Single String**:
   - Multi-line comments: `29/1Kg20 \n 31/1kg20`, `44=1 \n 46=1 \n 45=1`
   - Dot/Slash separated: `29=1.31=1`, `52/53`, `47=1/44=1`, `115m \n 115L`
   - Action separated: `យក48=2 យក49=2`, `ថែមកូដ 33 មួយអាវ ពណ៌ស កូដ 46 មួយអាវ ពណ៌ស`
   - List format: `បងយកកូត31=២ 36=១ 42=២ 55=១ 60=២`
4. **Attached Weight/Size Normalization**:
   - Weight notes attached to qty/code: `31=2kg26` (Code 31, Qty 2, 26kg), `29=1គិឡ31` (Code 29, Qty 1, 31kg), `57/70យក១` (Code 57, 70kg, Qty 1), `71=1.35gk` (Code 71, Qty 1, 35kg), `80 75គីទ្បូ` (Code 80, Qty 1, 75kg)
   - Multi-size extraction: `79:3sml` (Code 79, Qty 3, sizes S, M, L), `115=3 S M L` (Code 115, Qty 3, sizes S, M, L), `124 យក s m` (Code 124, Qty 2, sizes S, M)
   - Letter sizes in Khmer/English: `លេខអេះ` (Size S), `សាយអឹម` (Size M), `សាយL` (Size L), `សាយXL` (Size XL), `3XL`, `2XL`
5. **Phone & Address Isolation Before Code Matching**:
   - Ensure phone numbers like `0888161883`, `085662216`, `0969909397`, `070259169`, `0886944525`, `0966443226` are cleanly extracted and do NOT trigger false code matches (e.g. `11)10888161883` -> Code 11, Qty 1, Phone `0888161883`).
   - Ensure location strings (e.g. `បុរីពិភពថ្មីចំកាដូង ផ្លូវ07 ផ្ទះ54A`) mask out house/street numbers so `07` or `54` do not become false product codes.

---

## 1. Technical Strategy & Implementation Plan

```
┌─────────────────────────────────────────────────────────────┐
│                    Raw Comment Input                        │
│   "0976886947 បុរីពិភពថ្មីចំកាដូង ផ្លូវ07 ផ្ទះ54A  51=3  33:2"    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Preprocessing & Masking                             │
│ - Extract Phone Numbers (088..., 096..., 012...)            │
│ - Extract & Mask Address/House/Street numbers               │
│ - Normalize Khmer Digits [០-៩] to Arabic [0-9]               │
│ - Strip Price Patterns ($3.5, 5000៛, 0.5$)                  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Question / Inquiry Filter                           │
│ - Detect question phrases (លក់ម៉េច, អត់, ម៉ាន, etc.)       │
│ - Mark as Question/General Comment if no purchase intent    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Multi-Segment Tokenizer & Pair Extraction           │
│ - Split multi-item expressions (newlines, '.', '/', 'យក')   │
│ - Parse Code + Delimiter + Qty with extended delimiters:    │
│   [: ; » _ - () "" + , / =]                                 │
│ - Parse Khmer word quantities (មួយ, ពីរ, បី, ដប់...)        │
│ - Extract Size Notes (S, M, L, XL, 2XL, 3XL, kg, bust)     │
│ - Extract Color Notes (ស, ខ្មៅ, ក្រហម, ខៀវ, etc.)           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 4: Test Suite Verification                             │
│ - Add comprehensive test cases to scripts/test-parser-suite │
│ - Run test suite and confirm 100% pass on real dataset      │
└──────────────────────────────┬──────────────────────────────┘
```

---

## 2. Changes Required

1. **`src/utils/commentParser.ts`**:
   - Update `convertKhmerDigitsToArabic` and token normalizer to preserve clean delimiter semantics.
   - Update `RE_MEASUREMENTS_CLEANUP` and weight/size extractors to handle `gk`, `គិឡ`, `គឺទូ`, `គីទ្បូ`, `លេខអេះ`, `សាយអឹម`, `sml`, etc.
   - Expand `extractCodeQtyPairsFromComment` regex and tokenization loop to support all delimiters (`»`, `:`, `;`, `_`, `-`, `""`, `()`, `+`, `.`, `/`, `=`), Khmer numeral quantities (`មួយ`, `ពីរ`, `បី`, `ដប់`), and multi-item strings.
   - Enhance phone extraction to safely separate code and phone even when concatenated (e.g. `11)10888161883`, `650978787851`).
2. **`server/parser.ts`**:
   - Ensure server uses updated utility methods cleanly and question comment filter matches real inquiries.
3. **`scripts/test-parser-suite.ts`**:
   - Add test cases covering every real comment pattern from the user's dataset.
   - Run tests to verify perfection.
