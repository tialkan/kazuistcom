---
title: AI policy
slug: ai
route: /legal/ai
lang: en
binding: false
version: 2026-10-19.1
date: 2026-10-19
status: taslak
alternate: /hukuki/yapay-zeka
---

> TASLAK, Tarık onayı bekliyor. Version date: 19 October 2026.
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

- Platform mode: Kazuist's key, masked text sent to Anthropic.
- BYOK client mode (default): your key, called from your browser or iOS app directly.
- BYOK relay mode: your key passes through our server in memory only, never stored or logged; you are told before it is used.

Supported: Anthropic, OpenRouter, OpenAI, Google Gemini. With OpenRouter we request providers that do not collect
data by default, and zero data retention in privacy-first mode.

## Gemini free tier

Under Google's Gemini API terms, content sent on the free tier may be used to improve Google's products and may be
reviewed by humans; Google asks users not to send sensitive, confidential or personal information. Google applies
this to users outside the EEA, Switzerland and the UK [DOĞRULANACAK: current Gemini API terms]. Kazuist therefore
asks whether your key is on paid billing and, if not, disables sending unpublished drafts and Campus files unless you
explicitly opt in.

## Transparency note for EU users

Summaries are AI-generated and labelled as such. Kazuist is not designed to support judicial authorities.

## Logging

Content is not logged; only operation type, model, token counts, duration, cost and a hashed user identifier.
