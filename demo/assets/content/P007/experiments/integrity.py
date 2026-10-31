"""Owned deterministic synthetic demonstration. Never run by the server."""
import csv,hashlib,heapq,itertools,json,math,random,statistics,unicodedata

def integrity(seed):
    files = {f'data/sample-{i}.csv': f'{seed},{i},{i*i}'.encode() for i in range(12)}
    def manifest(data):
        nodes=[hashlib.sha256(p.encode()+b'\0'+hashlib.sha256(v).digest()).digest()
               for p,v in sorted(data.items())]
        while len(nodes)>1:
            if len(nodes)%2: nodes.append(nodes[-1])
            nodes=[hashlib.sha256(nodes[i]+nodes[i+1]).digest() for i in range(0,len(nodes),2)]
        return nodes[0].hex()
    root = manifest(files)
    detection = 0
    for p in files:
        changed = {**files, p: files[p] + b'changed'}
        detection += manifest(changed) != root
    assert root == manifest(dict(reversed(list(files.items())))) and detection == len(files)
    renamed=dict(files);value=renamed.pop('data/sample-0.csv');renamed['data/renamed.csv']=value
    flat=lambda data: sorted(hashlib.sha256(v).hexdigest() for v in data.values())
    assert flat(files)==flat(renamed) and manifest(renamed)!=root
    return {'mutations_detected': detection, 'mutation_cases': len(files),
            'ordering_invariant': 1, 'filename_only_misses': len(files), 'path_rename_detected':1, 'path_free_index_rename_misses':1}

if __name__=='__main__':
    print(json.dumps([{'case':i+1,**integrity(53600+i)} for i in range(30)],ensure_ascii=False,indent=2))
