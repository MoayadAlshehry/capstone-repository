"""Owned deterministic synthetic demonstration. Never run by the server."""
import csv,hashlib,heapq,itertools,json,math,random,statistics,unicodedata

def microgrid(seed):
    rng = random.Random(seed)
    net = [rng.randint(-3, 4) for _ in range(6)]
    tariffs = [1, 1, 3, 4, 2, 1]
    def search(t, energy):
        if t == 6: return 0
        return min(max(0, net[t] + delta) * tariffs[t] + search(t + 1, energy + delta)
                   for delta in [-1, 0, 1] if 0 <= energy + delta <= 3)
    states = {1: 0}
    for t, need in enumerate(net):
        nxt = {}
        for energy, cost in states.items():
            for delta in [-1, 0, 1]:
                e = energy + delta
                if 0 <= e <= 3:
                    v = cost + max(0, need + delta) * tariffs[t]
                    nxt[e] = min(nxt.get(e, math.inf), v)
        states = nxt
    optimal = min(states.values())
    assert optimal == search(0, 1)
    baseline = sum(max(0, n) * p for n, p in zip(net, tariffs))
    energy=1; fixed_reserve=0
    for need,price in zip(net,tariffs):
        delta=min(-need,3-energy,1) if need<0 else -min(need,max(0,energy-1),1)
        energy+=delta;fixed_reserve+=max(0,need+delta)*price
        assert 0<=energy<=3
    assert optimal <= baseline and optimal <= fixed_reserve
    return {'no_storage_cost_units': baseline, 'optimal_cost_units': optimal,
            'fixed_reserve_cost_units': fixed_reserve,
            'oracle_match': 1, 'horizon_steps': 6}

if __name__=='__main__':
    print(json.dumps([{'case':i+1,**microgrid(53500+i)} for i in range(30)],ensure_ascii=False,indent=2))
