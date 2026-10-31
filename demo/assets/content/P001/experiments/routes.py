"""Owned deterministic synthetic demonstration. Never run by the server."""
import csv,hashlib,heapq,itertools,json,math,random,statistics,unicodedata

def routes(seed, accessible=False):
    rng = random.Random(seed)
    edges = [(a, b, rng.randint(2, 20), rng.random())
             for a in range(7) for b in range(a + 1, 8)
             if b == a + 1 or rng.random() < .3]
    def enumerate_paths(node, cost, unsafe):
        if node == 7:
            return [(cost, unsafe)]
        return [out for a, b, d, risk in edges if a == node
                for out in enumerate_paths(b, cost + d, unsafe + int(risk > .7))]
    oracle = enumerate_paths(0, 0, 0)
    allowed = [p[0] for p in oracle if p[1] == 0]
    queue = [(0, 0)]
    best = {0: 0}
    while queue:
        cost, node = heapq.heappop(queue)
        if cost != best[node]: continue
        for a, b, d, risk in edges:
            if a != node or risk > .7: continue
            if cost + d < best.get(b, math.inf):
                best[b] = cost + d
                heapq.heappush(queue, (cost + d, b))
    found = best.get(7)
    assert found == (min(allowed) if allowed else None)
    shortest = min(oracle)
    return {'baseline_cost': shortest[0], 'baseline_violations': shortest[1],
            'constrained_cost': found if found is not None else -1,
            'constrained_violations': 0, 'unreachable': int(found is None),
            'oracle_paths': len(oracle)}

if __name__=='__main__':
    print(json.dumps([{'case':i+1,**routes(53000+i)} for i in range(30)],ensure_ascii=False,indent=2))
