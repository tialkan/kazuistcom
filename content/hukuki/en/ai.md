---
title: AI policy
slug: ai
route: /legal/ai
lang: en
binding: false
version: 2026-10-23.1
date: 2026-10-23
status: taslak
alternate: /hukuki/yapay-zeka
---

> TASLAK, Tarık onayı bekliyor. Version date: 23 October 2026.
> This English text is for information only. The binding version is Turkish: [Yapay zekâ politikası](/hukuki/yapay-zeka).

## Role

Kazuist is a research and learning tool. Sourced summaries link every sentence to the passage it relies on.
Kazuist does not give individual legal opinions and does not provide legal services.

## Abstention

If the sources are insufficient, no summary is produced and no credits are charged.

## Masking

Before any text leaves our servers, identifiers and personal names are replaced with labels such as [KİŞİ-1].
The mapping lives only in request memory. Masking is automated and cannot be guaranteed to be perfect; please
do not type sensitive personal data into queries.

## Providers and modes

- Platform mode: Kazuist's key, masked text routed through OpenRouter, Inc. (US) to the model, with
  `data_collection: "deny"` and `zdr: true` on every request; direct Anthropic only as fallback (ADR-0025).
  OpenRouter's docs state prompt logging is off by default and inputs and outputs are not used for training.
- BYOK client mode (default): your key, called from your browser or iOS app directly.
- BYOK relay mode: your key passes through our server in memory only, never stored or logged; you are told before it is used.

Supported: Anthropic, OpenRouter, OpenAI, Google Gemini. With OpenRouter we request providers that do not collect
data by default, and zero data retention in privacy-first mode.

## Gemini free tier

Under Google's Gemini API terms, content sent on the free tier may be used to improve Google's products and may be
reviewed by humans; Google asks users not to send sensitive, confidential or personal information. For users in the EEA,
Switzerland and the UK, Google requires Paid Services and applies paid data-use terms (Gemini API Additional Terms,
last updated 28 April 2026). Kazuist therefore
accepts a Gemini key only if you declare that it is on paid billing; free tier keys cannot be used.

## Transparency note for EU users

Summaries are AI-generated and labelled as such. Kazuist is not designed to support judicial authorities.

## Logging

Content is not logged; only operation type, model, token counts, duration, cost and a hashed user identifier.
