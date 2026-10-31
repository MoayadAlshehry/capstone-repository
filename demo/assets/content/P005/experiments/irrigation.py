"""Owned deterministic synthetic demonstration. Never run by the server."""
import csv,hashlib,heapq,itertools,json,math,random,statistics,unicodedata

def irrigation(seed):
    rng = random.Random(seed)
    moisture = [rng.randint(15, 45) for _ in range(30)]
    timer = 30 * 3
    threshold = sum(3 for v in moisture if v < 30)
    remaining = 45; decisions = []; active=False
    for value in moisture:
        if value < 25: active=True
        elif value > 35: active=False
        amount = min(3, remaining) if active else 0
        remaining -= amount; decisions.append(amount)
    assert sum(decisions) <= 45 and sum(decisions) + remaining == 45
    return {'fixed_timer_units': timer, 'threshold_units': threshold,
            'budgeted_units': sum(decisions), 'remaining_units': remaining,
            'explainable_decisions': len(decisions)}

if __name__=='__main__':
    print(json.dumps([{'case':i+1,**irrigation(53400+i)} for i in range(30)],ensure_ascii=False,indent=2))
