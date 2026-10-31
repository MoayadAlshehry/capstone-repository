"""Owned deterministic synthetic demonstration. Never run by the server."""
import csv,hashlib,heapq,itertools,json,math,random,statistics,unicodedata

def queues(seed):
    rng = random.Random(seed)
    durations = [rng.randint(1, 12) for _ in range(24)]
    def wait(order):
        t = 0; waits = []
        for j in order:
            waits.append(t); t += durations[j]
        return waits, t
    fifo, total = wait(list(range(24)))
    shortest, total_s = wait(sorted(range(24), key=lambda j: (durations[j], j)))
    bounded = []
    pending = list(range(24))
    while pending:
        window = pending[:5]
        j = min(window, key=lambda j: (durations[j], j))
        bounded.append(j); pending.remove(j)
    aged, total_a = wait(bounded)
    assert sorted(bounded) == list(range(24)) and total == total_s == total_a
    return {'fifo_mean_wait': statistics.mean(fifo), 'shortest_mean_wait': statistics.mean(shortest),
            'bounded_mean_wait': statistics.mean(aged), 'bounded_max_wait': max(aged),
            'jobs_conserved': len(bounded)}

if __name__=='__main__':
    print(json.dumps([{'case':i+1,**queues(53300+i)} for i in range(30)],ensure_ascii=False,indent=2))
