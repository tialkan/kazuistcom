#!/usr/bin/env python3
"""Convert archived Casuist HTML snapshots into JSON node trees (text kept verbatim).

Usage: python3 -I docs/tasarim/casuist-arsiv/donustur.py <archive dir> <output dir>

Each output file holds {path, lang, title, description, nav, tagline, main}.
Kazuist is Turkish only (ADR-0032): the English Casuist pages and the language links are not converted.
A node is a string or [tag, {attrs}, ...children]. Only whitelisted tags and attributes survive.
Scripts, styles, svg and canvas are dropped. Images keep their alt text, size and the original file
path (src, with the Next.js image optimizer URL unwrapped); the page maps that path to the local
AVIF/WebP copies made by gorselleri-donustur.mjs.
Cloudflare email protection is decoded to plain mailto links. /tr/hukuki/* links point to /hukuki/*
(the only link change Ek H allows besides the company particulars).
"""
import json
import os
import re
import sys
from html.parser import HTMLParser
from urllib.parse import unquote

PAGES = {
    'tr': '/tr', 'tr_sorun': '/tr/sorun', 'tr_nasil-calisir': '/tr/nasil-calisir',
    'tr_degerlendirme': '/tr/degerlendirme', 'tr_ortak': '/tr/ortak', 'tr_hakkinda': '/tr/hakkinda',
    'tr_hukuki_uyari': '/hukuki/uyari', 'tr_hukuki_gizlilik': '/hukuki/gizlilik',
    'tr_hukuki_cerezler': '/hukuki/cerezler', 'tr_hukuki_yapay-zeka': '/hukuki/yapay-zeka',
    'tr_hukuki_erisilebilirlik': '/hukuki/erisilebilirlik', 'eski': '/eski',
}
# The archived /eski wrapper carried an English title around Turkish text; the page is served in Turkish.
META = {'eski': {'lang': 'tr', 'title': 'Önceki Kazuist sitesi | Casuist',
                 'description': 'Önceki Kazuist sitesinin arşivi.'}}
TAGS = {'section', 'div', 'p', 'h1', 'h2', 'h3', 'h4', 'span', 'a', 'strong', 'em', 'b', 'i', 'ul', 'ol',
        'li', 'dl', 'dt', 'dd', 'article', 'blockquote', 'details', 'summary', 'table', 'thead', 'tbody',
        'tr', 'th', 'td', 'br', 'img', 'nav', 'footer', 'header', 'small', 'code', 'sup', 'sub', 'figure',
        'figcaption', 'abbr', 'time', 'hr', 'main'}
DROP = {'script', 'style', 'svg', 'canvas', 'noscript', 'template', 'button', 'form', 'input'}
VOID = {'br', 'img', 'hr', 'meta', 'link', 'input', 'source', 'path', 'rect', 'ellipse', 'circle', 'line'}
DEAD_LINKS = {'/demo'}  # old site demo page, gone (docs/istekler/kalite-on-yuz-baglantilar.md)
HTML_VOID = {'br', 'img', 'hr', 'meta', 'link', 'input', 'source', 'wbr', 'area', 'col', 'embed'}
ATTRS = {'class', 'href', 'id', 'alt', 'lang', 'hreflang', 'open', 'aria-label', 'colspan', 'rowspan',
         'scope', 'datetime', 'title', 'width', 'height'}
BLOCK = {'section', 'div', 'ul', 'ol', 'dl', 'table', 'thead', 'tbody', 'tr', 'article', 'details', 'nav',
         'main', 'footer', 'header', 'figure', 'blockquote'}


def cf_decode(hexstr):
    key = int(hexstr[:2], 16)
    return ''.join(chr(int(hexstr[i:i + 2], 16) ^ key) for i in range(2, len(hexstr), 2))


def img_src(s):
    m = re.match(r'/_next/image\?url=([^&]+)', s)
    return unquote(m.group(1)) if m else s


def fix_href(h):
    m = re.match(r'/cdn-cgi/l/email-protection#([0-9a-f]+)', h)
    if m:
        return 'mailto:' + cf_decode(m.group(1))
    if h.startswith('/tr/hukuki/'):
        return '/hukuki/' + h[len('/tr/hukuki/'):]
    if h == '/':
        return '/tr'
    return h


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = ['root', {}]
        self.stack = [self.root]
        self.skip = 0
        self.strip_classes = False

    def handle_starttag(self, tag, attrs):
        if self.skip:
            if tag not in HTML_VOID:
                self.skip += 1
            return
        if tag in DROP:
            if tag not in VOID:
                self.skip = 1
            return
        a = {k: (v if v is not None else '') for k, v in attrs}
        if 'data-cfemail' in a:
            email = cf_decode(a['data-cfemail'])
            node = ['a', {'href': 'mailto:' + email}, email] if tag == 'a' else email
            self.stack[-1].append(node)
            if tag not in VOID:
                self.stack.append(['__cf', {}])
            return
        keep = {k: v for k, v in a.items() if k in ATTRS}
        if self.strip_classes:
            keep.pop('class', None)
        if 'href' in keep:
            keep['href'] = fix_href(keep['href'])
        if tag == 'img':
            self.stack[-1].append(['img', {'alt': keep.get('alt', ''), 'width': keep.get('width', ''),
                                           'height': keep.get('height', ''),
                                           'src': img_src(a.get('src', ''))}])
            return
        if tag == 'a' and keep.get('href') in DEAD_LINKS:
            # Target no longer exists; only the link is removed, the text stays (Ek H).
            keep.pop('href')
            tag = 'span'
        node = [tag if tag in TAGS else 'span', keep]
        self.stack[-1].append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        if self.skip:
            return  # a self-closed tag inside a dropped subtree opens nothing
        self.handle_starttag(tag, attrs)
        if tag not in VOID and tag not in DROP:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if self.skip:
            if tag not in HTML_VOID:
                self.skip -= 1
            return
        if tag in VOID:
            return
        if len(self.stack) > 1:
            self.stack.pop()

    def handle_data(self, data):
        if self.skip or self.stack[-1][0] == '__cf':
            return
        self.stack[-1].append(data)


def clean(node, parent_block=False):
    if isinstance(node, str):
        text = re.sub(r'\s+', ' ', node)
        if text.strip() == '' and parent_block:
            return None
        return text
    tag, attrs, *kids = node
    out = []
    for k in kids:
        c = clean(k, tag in BLOCK)
        if c is not None and c != '':
            out.append(c)
    # trim whitespace at the edges of block level children
    if out and isinstance(out[0], str) and tag in BLOCK | {'p', 'h1', 'h2', 'h3', 'h4', 'li', 'dt', 'dd', 'td', 'th', 'summary'}:
        out[0] = out[0].lstrip()
    if out and isinstance(out[-1], str) and tag in BLOCK | {'p', 'h1', 'h2', 'h3', 'h4', 'li', 'dt', 'dd', 'td', 'th', 'summary'}:
        out[-1] = out[-1].rstrip()
    out = [o for o in out if o != '']
    return [tag, attrs, *out]


def find(node, pred):
    if isinstance(node, str):
        return None
    if pred(node):
        return node
    for k in node[2:]:
        r = find(k, pred)
        if r is not None:
            return r
    return None


def text_of(node):
    if isinstance(node, str):
        return node
    return ''.join(text_of(k) for k in node[2:])


def main(src, dst):
    os.makedirs(dst, exist_ok=True)
    for name, path in PAGES.items():
        html = open(os.path.join(src, name + '.html'), encoding='utf-8').read()
        title = re.search(r'<title>(.*?)</title>', html, re.S)
        desc = re.search(r'<meta name="description" content="([^"]*)"', html)
        lang = re.search(r'<div lang="([a-z]+)"', html) or re.search(r'<html lang="([a-z]+)"', html)
        t = Tree()
        t.strip_classes = name == 'eski'  # utility classes of the old site carry no meaning here
        t.feed(html)
        tree = clean(t.root)
        main_node = find(tree, lambda n: n[0] == 'main')
        nav = find(tree, lambda n: n[0] == 'nav' and n[1].get('class') == 'masaustu-menu')
        tagline = None
        footer = find(tree, lambda n: n[0] == 'footer')
        if footer is not None:
            alt_ust = find(footer, lambda n: n[0] == 'p')
            tagline = text_of(alt_ust) if alt_ust is not None else None
        import html as h
        data = {
            'path': path,
            'source': 'https://kazuist.com/' + ('' if name == 'index' else name.replace('_', '/')),
            'lang': lang.group(1) if lang else 'tr',
            'title': h.unescape(title.group(1)) if title else '',
            'description': h.unescape(desc.group(1)) if desc else '',
            'nav': [{'href': k[1].get('href', ''), 'text': text_of(k)} for k in (nav[2:] if nav else [])
                    if not isinstance(k, str)],
            'tagline': tagline,
            'main': main_node[2:] if main_node else [],
        }
        data.update(META.get(name, {}))
        with open(os.path.join(dst, name + '.json'), 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
            f.write('\n')
        print(name, '->', path, len(json.dumps(data)))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
