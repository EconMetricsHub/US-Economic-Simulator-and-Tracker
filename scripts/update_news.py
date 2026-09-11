#!/usr/bin/env python3
"""Build a static news-intelligence snapshot for MACROSCOPE.

Uses GDELT DOC 2.0 ArticleList JSON. No API key is required. The browser only
loads the generated JSON file, making the GitHub Pages site deterministic and
avoiding client-side rate limits.
"""
from __future__ import annotations
import json, os, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

OUT=Path(os.getenv('NEWS_OUTPUT','data/news-feed.json'))
MAX_PER_CATEGORY=int(os.getenv('NEWS_MAX_PER_CATEGORY','18'))
TIMESPAN=os.getenv('NEWS_TIMESPAN','24h')
API='https://api.gdeltproject.org/api/v2/doc/doc'
QUERIES={
 'economy':'(economy OR inflation OR unemployment OR jobs OR "Federal Reserve" OR recession OR GDP OR tariffs OR Treasury)',
 'politics':'("United States" AND (Congress OR Senate OR House OR president OR election OR budget OR regulation OR tax))',
 'geopolitics':'(Ukraine OR Russia OR China OR Taiwan OR Iran OR Israel OR NATO OR "South China Sea" OR sanctions OR war)',
}

def fetch(query):
    params={'query':query,'mode':'artlist','format':'json','timespan':TIMESPAN,'maxrecords':MAX_PER_CATEGORY*3,'sort':'HybridRel'}
    req=Request(API+'?'+urlencode(params),headers={'User-Agent':'MACROSCOPE/5.0 (+https://github.com/econmetricshub/US-Economic-Simulator-and-Tracker)'})
    with urlopen(req,timeout=45) as r:
        return json.loads(r.read().decode('utf-8'))

def parse_seen(v):
    if not v: return None
    s=str(v).strip()
    for fmt in ('%Y%m%dT%H%M%SZ','%Y%m%d%H%M%S','%Y-%m-%dT%H:%M:%SZ'):
        try: return datetime.strptime(s,fmt).replace(tzinfo=timezone.utc).isoformat().replace('+00:00','Z')
        except ValueError: pass
    return s

def clean_article(a,cat):
    return {
      'category':cat,
      'title':(a.get('title') or '').strip(),
      'url':a.get('url') or '',
      'domain':a.get('domain') or '',
      'sourceCountry':a.get('sourcecountry') or '',
      'language':a.get('language') or '',
      'publishedAt':parse_seen(a.get('seendate')),
      'image':a.get('socialimage') or '',
    }

def main():
    old={}
    if OUT.exists():
        try: old=json.loads(OUT.read_text())
        except Exception: old={}
    items=[]; status={}
    for cat,q in QUERIES.items():
        try:
            data=fetch(q); arts=data.get('articles') or []
            cleaned=[]; seen=set()
            for a in arts:
                x=clean_article(a,cat)
                key=(x['url'] or x['title']).lower()
                if not x['title'] or not x['url'] or key in seen: continue
                seen.add(key); cleaned.append(x)
                if len(cleaned)>=MAX_PER_CATEGORY: break
            items.extend(cleaned); status[cat]={'ok':True,'count':len(cleaned)}
        except Exception as e:
            fallback=[x for x in old.get('items',[]) if x.get('category')==cat][:MAX_PER_CATEGORY]
            items.extend(fallback); status[cat]={'ok':False,'count':len(fallback),'error':str(e)[:180]}
        time.sleep(.8)
    # global dedupe while preserving category relevance order
    dedup=[]; seen=set()
    for x in sorted(items,key=lambda z:z.get('publishedAt') or '',reverse=True):
        k=(x.get('url') or x.get('title','')).lower()
        if k in seen: continue
        seen.add(k); dedup.append(x)
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps({'schemaVersion':1,'generatedAt':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),'provider':'GDELT DOC 2.0','status':status,'items':dedup},indent=2,ensure_ascii=False)+'\n')
    print(f'wrote {len(dedup)} news items to {OUT}')
if __name__=='__main__': main()
