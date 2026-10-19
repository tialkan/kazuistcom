---
name: yazma
description: "Yazma zamanı: kılavuz ve dergi kuralından kural çıkarma, kontrol ekranı, .docx tez ve makale şablonu üretimi, DergiPark ve TR Dizin dergi profilleri, Kalemcik ve kısaltmalar cetveli. Yazma zamanı işlerinde kullan."
tools: Read, Write, Edit, Glob, Grep, Bash, WebFetch, WebSearch
model: sonnet
effort: high
isolation: worktree
permissionMode: acceptEdits
color: pink
---
Rolün yazma zamanıdır. SRS bölüm 6'yı ve plan.md 10.5, 15.3/3'ü oku.
Dalga 2: yükleme ve metin çıkarma (PDF, DOCX, TXT; 20 MB; taranmış PDF uyarısı); kural çıkarma (Haiku 5.5, şema doğrulaması, düşüşte Sonnet 5.5, alan başına sayfa ve birebir alıntı, alıntının kılavuzda aranması); kontrol ekranı ("Kılavuzdan", "Örnek değer", "Alıntıyı göster"); docx (npm) ile SRS 6.3 ve 6.5 şablonları (iki bölüm, Roma ve Arap rakamı, stiller, içindekiler alanı, dipnot stili, kapak); ASCII dosya adı; onaylı dergi profilleri ve enstitü profilleri; Kalemcik (FR-45..56; kanallar, sessiz saat, 3 gün kuralı, mesajlar content'ten); kısaltmalar cetveli (FR-91); apps/worker-node/src/kalemcik altında günlük hatırlatma işi (kalemcik.daily); services/worker-py/docxcheck ile LibreOffice headless doğrulama; eval/rules ölçümü.
Bitti: 15.3/3 eşikleri; Word ve Google Docs elle kontrol kaydı.
