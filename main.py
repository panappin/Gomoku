import os
import re
import time
import json
import hashlib
import requests
from bs4 import BeautifulSoup, Tag
from collections import deque, defaultdict
from urllib.parse import urlparse, urljoin, unquote
from FlagEmbedding import FlagModel

# ---------------- Config ---------------- #
WIKI_BASE = "https://en.wikipedia.org"
ARTICLE_PREFIX = "/wiki/"
CONTENT_SELECTOR_ID = "mw-content-text"
USER_AGENT = "WikiRaceSolver/1.2 (educational; contact: your_email@example.com)"
CACHE_DIR = ".wiki_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

# Sections/containers to skip (to avoid refs, navboxes, etc.)
SKIP_SECTIONS = {
    "References", "Notes", "Footnotes", "Further reading",
    "External links", "Bibliography", "Sources", "Citations"
}
SKIP_ANCHOR_CLASSES = {
    "reference", "mw-selflink", "external", "extiw"  # citation markers, self-links, external/interwiki
}
SKIP_CONTAINER_CLASSES = {
    "reflist", "navbox", "infobox", "metadata", "hatnote",
    "toc", "mbox-small", "sistersitebox", "vertical-navbox",
}


# ---------------- Helpers ---------------- #
def norm_article_url(url_or_path: str) -> str:
    """
    Normalize to canonical '/wiki/Title' (desktop) with underscores, stripping fragments/queries.
    Accepts:
      - full URL (https://en.wikipedia.org/wiki/...)
      - mobile URL (https://en.m.wikipedia.org/wiki/...)
      - path (/wiki/...)
    """
    s = url_or_path.strip()
    if s.startswith("http"):
        p = urlparse(s)
        path = p.path
    else:
        path = s

    if not path.startswith(ARTICLE_PREFIX):
        raise ValueError(f"Not an article URL/path: {url_or_path}")

    path = path.split("#", 1)[0]  # drop fragment
    path = unquote(path).replace(" ", "_")
    return path


def printable_title(article_path: str) -> str:
    return article_path[len(ARTICLE_PREFIX):].replace("_", " ")


def cache_path(key: str) -> str:
    h = hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]
    return os.path.join(CACHE_DIR, f"{h}.json")


def is_skippable_container(tag: Tag) -> bool:
    classes = set(tag.get("class", []))
    return bool(classes & SKIP_CONTAINER_CLASSES)


def in_main_namespace(href: str) -> bool:
    """
    Allow only /wiki/Title in the main namespace (no 'File:', 'Help:' etc.).
    """
    if not href or not href.startswith(ARTICLE_PREFIX):
        return False
    title = href[len(ARTICLE_PREFIX):]
    return ":" not in title


# ---------------- Fetch & cache ---------------- #
def fetch_html(article_path: str) -> str:
    """
    Fetch rendered desktop HTML with on-disk cache.
    """
    url = urljoin(WIKI_BASE, article_path)
    cp = cache_path("html:" + article_path)
    if os.path.exists(cp):
        with open(cp, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data["html"]

    time.sleep(0.2)  # be polite
    headers = {"User-Agent": USER_AGENT}
    r = requests.get(url, headers=headers, timeout=20)
    r.raise_for_status()
    html = r.text
    with open(cp, "w", encoding="utf-8") as f:
        json.dump({"html": html, "url": url}, f)
    return html


# ---------------- Parsing ---------------- #
def extract_links_and_positions(article_path: str):
    """
    Parse outgoing article links in reading order and capture the anchor text that links to them.

    Returns:
      ordered_links: list[str] - normalized /wiki/Child
      positions: dict[child_path] -> list of dicts:
         { "anchor_text": "..." }
    """
    html = fetch_html(article_path)
    soup = BeautifulSoup(html, "html.parser")

    content = soup.find(id=CONTENT_SELECTOR_ID)
    if not content:
        return [], {}

    body = content.find(class_="mw-parser-output") or content

    links = []
    positions = defaultdict(list)

    current_section = "Lead"
    in_skip_section = False

    # iterate children preserving reading order
    for node in body.children:
        if not isinstance(node, Tag):
            continue

        if is_skippable_container(node):
            continue

        # Section headings h2..h4
        if node.name in ("h2", "h3", "h4"):
            headline = node.find(class_="mw-headline")
            if headline:
                current_section = headline.get_text(strip=True)
            else:
                current_section = node.get_text(strip=True)
            in_skip_section = current_section in SKIP_SECTIONS
            continue

        if in_skip_section:
            continue

        # collect from paragraphs and lists only
        if node.name in ("p", "ul", "ol"):
            # Remove citation superscripts like [1]
            for supref in node.select("sup.reference"):
                supref.decompose()

            for a in node.find_all("a", href=True):
                if is_skippable_container(a.parent):
                    continue
                ac = set(a.get("class", []))
                if ac & SKIP_ANCHOR_CLASSES:
                    continue

                href = a.get("href")
                if not in_main_namespace(href):
                    continue

                child = norm_article_url(href)
                links.append(child)
                positions[child].append({
                    "anchor_text": a.get_text(strip=True)
                })

    # Deduplicate while preserving first occurrence
    seen = set()
    ordered = []
    for l in links:
        if l not in seen:
            seen.add(l)
            ordered.append(l)
    return ordered, positions


def neighbors(article_path: str):
    """
    Outgoing article links and their anchor text info.
    """
    try:
        links, pos = extract_links_and_positions(article_path)
    except Exception:
        return [], {}
    return links, pos


# ---------------- Graph search (unidirectional BFS) ---------------- #
def reconstruct_path(prev_map, src, dst):
    path = []
    cur = dst
    while cur is not None:
        path.append(cur)
        cur = prev_map.get(cur)
    path.reverse()
    if not path or path[0] != src:
        return None
    return path


def bfs_shortest_path(src: str, dst: str, max_expansions: int = 50000, verbose: bool = False):
    """
    Unidirectional BFS from src to dst over outgoing links only.
    Returns (path, pos_map) where pos_map[(a,b)] has {"anchor_text": "..."}.
    """
    if src == dst:
        return [src], {}

    q = deque([src])
    prev = {src: None}
    pos_map = {}
    expansions = 0

    while q and expansions <= max_expansions:
        u = q.popleft()
        print(u)
        expansions += 1
        if verbose:
            print(f"Processing: {WIKI_BASE}{u}")
        nbrs, positions = neighbors(u)
        for v in nbrs:
            if v in prev:
                continue
            prev[v] = u
            if v in positions and positions[v]:
                pos_map[(u, v)] = positions[v][0]  # first occurrence anchor text
            if v == dst:
                path = reconstruct_path(prev, src, dst)
                return path, pos_map
            q.append(v)

    return None, {}


# ---------------- Output ---------------- #
def print_solution(path, pos_map):
    print(f"Path length: {len(path) - 1} hops")
    for i in range(len(path)):
        article = path[i]
        title = printable_title(article)
        print(f"{i:2d}. {WIKI_BASE}{article}  [{title}]")
        if i < len(path) - 1:
            nxt = path[i + 1]
            p = pos_map.get((article, nxt))
            if p and p.get("anchor_text"):
                print(f"    Next via: “{p['anchor_text']}”")
            else:
                print("    Next via: (anchor text not captured)")


# ---------------- CLI ---------------- #
def solve(src_input: str, dst_input: str, verbose: bool = False):
    """
    Accept src/dst as full URLs or '/wiki/Title' paths.
    """
    src = norm_article_url(src_input)
    dst = norm_article_url(dst_input)
    path, pos_map = bfs_shortest_path(src, dst, max_expansions=50000, verbose=verbose)
    if not path:
        print("No path found within limits.")
    else:
        print_solution(path, pos_map)


# s = time.time()
# sentences_1 = ['AlanTuring']
# sentences_2 = ['Computer']
# model = FlagModel('BAAI/bge-small-en-v1.5',
#                   query_instruction_for_retrieval="Represent this sentence for searching relevant passages: ",
#                   use_fp16=True) # Setting use_fp16 to True speeds up computation with a slight performance degradation
# embeddings_1 = model.encode(sentences_1)
# embeddings_2 = model.encode(sentences_2)
# similarity = embeddings_1 @ embeddings_2.T
# e = time.time()
# print(similarity, e-s)

# solve("https://en.wikipedia.org/wiki/Alan_Turing","https://en.wikipedia.org/wiki/Machine",False)

from wikipedia2vec import Wikipedia2Vec
from gensim.models import KeyedVectors
print('loading model')
MODEL_FILE = r'C:\Users\panap\PycharmProjects\PythonProject\enwiki_20180420_100d.txt\enwiki_20180420_100d.txt'
kv = KeyedVectors.load_word2vec_format(MODEL_FILE, binary=False)
# Words:
v = kv["computer"]


# Entities (Wikipedia2Vec text uses 'ENTITY/Title_with_Underscores'):
def entity_vec(title: str):
    key = f"ENTITY/{title.replace(' ', '_')}"
    return kv[key]


# Example
pikachu = entity_vec("Pikachu")  # entity vector
alan = entity_vec("Alan_Turing")  # or "Alan Turing"
northernlion = entity_vec("Northernlion")
dubbin = kv['dubbin']
# wiki2vec = Wikipedia2Vec.load(MODEL_FILE)
# print('loaded model')
# vec1 = wiki2vec.get_word_vector('Dubbin')
# vec2 = wiki2vec.get_entity_vector('Northernlion')
print(alan, pikachu, northernlion, dubbin)
