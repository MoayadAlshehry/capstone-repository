"""Owned deterministic synthetic demonstration. Never run by the server."""
import csv,hashlib,heapq,itertools,json,math,random,statistics,unicodedata

def retrieval(seed):
    rng = random.Random(seed)
    topics = ['الطاقة الشمسية', 'مراقبة المياه', 'أرشفة البحوث', 'تحليل البيانات', 'شبكات المستشعرات']
    docs = [f'{topics[i % 5]} مشروع {i}' for i in range(40)]
    def normalize(s):
        return ''.join(c for c in unicodedata.normalize('NFD', s)
                       if unicodedata.category(c) != 'Mn').replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا')
    topic = rng.randrange(5)
    query = topics[topic].replace('أ', 'ا')
    relevant = {i for i in range(len(docs)) if i % 5 == topic}
    raw = [i for i, d in enumerate(docs) if query in d]
    norm = [i for i, d in enumerate(docs) if normalize(query) in normalize(d)]
    assert set(norm) == relevant
    return {'literal_recall': len(set(raw) & relevant) / len(relevant),
            'normalized_recall': len(set(norm) & relevant) / len(relevant),
            'normalized_precision': len(set(norm) & relevant) / max(1, len(norm)),
            'relevant_documents': len(relevant)}

if __name__=='__main__':
    print(json.dumps([{'case':i+1,**retrieval(53100+i)} for i in range(30)],ensure_ascii=False,indent=2))
