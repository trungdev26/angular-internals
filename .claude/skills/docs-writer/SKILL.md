---
name: docs-writer
description: Use when writing, editing, or reviewing technical documents under src/assets/docs and their interactive demos. Enforces modern framework-documentation style, progressive lesson flow, prerequisite ordering, standard headings, and connected explanations instead of learning-note fragments.
---

# Documentation writer

Write in the style of current Angular documentation, React documentation, and MDN. Produce a coherent technical lesson, not a collection of notes.

## Mandatory rules

- **MUST**: match the actual page format of angular.dev/React.dev/MDN, not just their tone. This has been corrected repeatedly — tone alone (rule below) is not enough. Concretely:
  - Keep paragraphs short (2–4 sentences). When a paragraph is doing more than one job — explaining a reason AND listing cases AND giving a recommendation — split it into a bulleted list or a table instead of one long reasoning chain.
  - Any set of named options, parameters, states, or config keys goes in a table (`Tên | Kiểu/Giá trị | Mô tả`), not a paragraph that narrates them one by one in prose.
  - Do not chain a list of distinct items into one sentence with commas and parentheses, e.g. `X còn giữ A (ví dụ ...), B đang được giữ, và C của D`. Each item picked up by "và", or explained via a parenthetical aside, is a signal the sentence is actually a list wearing prose clothing — break it into a bulleted list or table, one item per line, so a reader can scan and retain it instead of parsing a run-on clause.
  - Use blockquote callouts for a warning/tip/caveat that would otherwise be buried mid-paragraph, e.g. `> **Lưu ý:** ...` — the way angular.dev uses `IMPORTANT`/`TIP` boxes and MDN uses "Note" asides.
  - A reader skimming only headings, bold terms, code, and tables should already get the shape of the page. If understanding a section requires reading every sentence of running prose, restructure it.
- Establish the prerequisite boundary before drafting. Never refer to a concept before introducing it.
- Define unfamiliar terms from the page title in plain language at their first appearance. Do not assume the reader understands title terminology.
- Do not carry wording, assumptions, or section order from an older draft unless they still serve the current lesson.
- Use conventional, searchable noun-phrase headings. Do not use conversational questions as headings.
- Use direct, neutral documentation prose without meta-commentary. Write like a reference page (Angular docs, MDN), not like a spoken explanation or a chat reply to the reader. State facts about the subject; do not narrate what the document itself is about to do.
  - Avoid: `Trước khi đi vào chi tiết, ...`, `Các mục dưới đây lần lượt sẽ ...`, `Hãy cùng ...`, `Chúng ta sẽ tìm hiểu ...`, `Ở phần này mình sẽ ...`, or any first/second-person framing that addresses the reader like a conversation.
  - Prefer stating the definition or behavior directly, then letting the section structure itself carry the "what's next" — don't announce it in prose.
- Avoid rhetorical filler and repeated lead-ins such as `Điều đáng chú ý`, `Hãy nhớ rằng`, or `Trước tiên, tạm bỏ ... sang một bên`.
- Avoid spoken-register hedges that report common usage instead of stating the fact: `ngoài đời (code review) người ta thường nói`, `X có đúng một nhiệm vụ là...`, `nói nôm na là`, `kiểu như`. If a term has a formal name and a commonly-spoken shorter name, state both as facts in one clean clause (`Tên chính thức là X, thường được gọi ngắn gọn là Y`) — do not frame it as reporting what people say out loud.
- Never interrupt a sentence's main clause with a long em-dash hedge/caveat aside (e.g. `Một cách hình dung phổ biến — không phải yêu cầu của đặc tả ECMAScript, nhưng đúng với cách các engine phổ biến triển khai — là primitive được lưu trên stack`). State the claim directly first; if a caveat about scope, accuracy, or spec-compliance is needed, put it in its own trailing sentence after. Short em-dash asides (a few words, a concrete example, or a named exception) are fine — the banned pattern is specifically a multi-clause hedge/disclaimer wedged inside the main sentence.
- State the plain-language theory or definition of a concept before any code that demonstrates it. The reader must know what a code block is about to prove before reading it — never open a section with unexplained code that only gets named afterward.
- The first example for a concept must be simple enough that someone who just read the definition can trace it by hand: no unrelated advanced syntax (generics, utility types, uncommon APIs) mixed into it. Save idiomatic/advanced implementations for the deeper extension that follows.
- Keep each paragraph focused on one claim and connect dependent ideas explicitly.
- Prefer one running example that grows one concept at a time.
- After the base definition and example, extend into deeper mechanics, edge cases, or trade-offs under their own subheading — a distinct "how it really works" layer, the way React.dev uses "Deep Dive" callouts and angular.dev uses advanced-usage sections following the basic explanation. Never label this by audience ("dành cho senior", "nâng cao dành cho middle") — frame it by what it covers (mechanism, edge case, trade-off), not by who it's for.
- Do not label document prose by junior, middle, senior, level, or cấp độ.
- Cover the full basic-to-advanced range, not just the interesting middle. Before the mechanism/trade-off content, include: what the thing is (formal definition), installation/setup (packages, minimal working config), and the core API/options a reader needs to use it day to day. Do not skip straight from a one-paragraph definition into an isolated code snippet — a reader who has never touched the subject must be able to get it running from the document alone. This has been a repeated correction: documents that read as "just the advanced/interesting parts" are treated as incomplete, not as appropriately concise.

## Default lesson flow

1. State the plain-language theory/definition of the concept.
2. Show a minimal example a newcomer to the concept can trace by hand.
3. Trace the execution in order, connecting each step back to the definition.
4. Extend into deeper mechanics, edge cases, or trade-offs under a distinct subheading.
5. Diagnose a realistic failure using that mechanism.
6. Apply it to Angular or RxJS after the JavaScript model is clear.
7. End with focused practice and a concise summary.

Do not force an identical section count across topics. Preserve the reasoning order.

## Review checklist

Before completing a document:

1. Read it as someone who knows syntax but not the mechanism.
1b. Read each sentence and ask: would this appear in MDN or angular.dev, or does it sound like something explained out loud to a colleague? Rewrite anything in the second category — this has been the single most repeated correction on this skill, so check for it explicitly rather than assuming earlier rules already caught it.
2. Remove terms used before their definition.
3. Remove phrases that depend on an older draft or conversation.
4. Replace note fragments with connected reasoning.
5. Verify headings are standard and searchable.
6. Verify each example advances the same learning path.
7. Build or render the site when formatting, routes, or demos changed.
8. Confirm installation/setup and the everyday API surface are covered before the advanced material — not just the mechanism deep-dive.
9. Skim only the headings, bold terms, tables, and code — if that skim doesn't convey the page, convert some running prose into tables/bullets/callouts per the MUST rule above.
