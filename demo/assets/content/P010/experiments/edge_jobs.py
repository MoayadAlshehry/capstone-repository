"""Owned deterministic synthetic demonstration. Never run by the server."""
import csv,hashlib,heapq,itertools,json,math,random,statistics,unicodedata

def edge_jobs(seed):
    rng = random.Random(seed)
    jobs = [(i, rng.randint(1, 4), rng.randint(4, 24)) for i in range(16)]
    def schedule(rows):
        elapsed = 0; met = 0
        for _, cost, deadline in rows:
            elapsed += cost; met += elapsed <= deadline
        return met
    fifo = schedule(jobs)
    deadline = schedule(sorted(jobs, key=lambda j: (j[2], j[0])))
    elapsed=0; admitted=0; rejected=0
    for _,cost,due in sorted(jobs,key=lambda j:(j[2],j[0])):
        if elapsed+cost<=due: elapsed+=cost;admitted+=1
        else: rejected+=1
    assert admitted+rejected==len(jobs)
    seen = set(); effects = []
    for j in [*jobs, *jobs]:
        if j[0] not in seen: effects.append(j[0]); seen.add(j[0])
    assert len(effects) == len(jobs)
    return {'fifo_deadlines_met': fifo, 'deadline_order_met': deadline,
            'admitted_deadlines_met':admitted,'explicitly_rejected_jobs':rejected,
            'unique_effects': len(effects), 'replayed_inputs': len(jobs) * 2}

if __name__=='__main__':
    print(json.dumps([{'case':i+1,**edge_jobs(53900+i)} for i in range(30)],ensure_ascii=False,indent=2))
