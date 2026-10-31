"""Owned deterministic synthetic demonstration. Never run by the server."""
import csv,hashlib,heapq,itertools,json,math,random,statistics,unicodedata

def validation(seed):
    rows = [{'id': i, 'value': (seed + i) % 21} for i in range(25)]
    rows += [{'id': 1, 'value': -1}, {'id': 26, 'value': None}]
    seen = set(); accepted = []; rejected = []
    for row in rows:
        if row['id'] in seen or not isinstance(row['value'], int) or row['value'] < 0:
            rejected.append(row)
        else:
            accepted.append(row); seen.add(row['id'])
    assert len(accepted) == 25 and len(rejected) == 2
    return {'valid_rows': len(accepted), 'invalid_rows_detected': len(rejected),
            'input_rows': len(rows), 'unique_output_ids': len(seen)}

if __name__=='__main__':
    print(json.dumps([{'case':i+1,**validation(54500+i)} for i in range(30)],ensure_ascii=False,indent=2))
