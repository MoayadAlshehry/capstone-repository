"""Owned deterministic synthetic demonstration. Never run by the server."""
import csv,hashlib,heapq,itertools,json,math,random,statistics,unicodedata

def anomalies(seed):
    rng = random.Random(seed)
    signal = [20 + rng.uniform(-.25, .25) + (2 if 50 <= i < 60 else 0) for i in range(100)]
    signal[25] += 1.4
    fixed = [i for i, x in enumerate(signal) if x > 21]
    zscore=[]
    for i in range(10,100):
        window=signal[i-10:i]
        deviation=statistics.pstdev(window)
        if deviation and (signal[i]-statistics.mean(window))/deviation>3:
            zscore.append(i)
    persistent = [i for i in range(1, 100) if signal[i] > 21 and signal[i - 1] > 21]
    truth = set(range(50, 60))
    assert 25 in fixed and 25 not in persistent
    return {'fixed_false_alarms': len(set(fixed) - truth),
            'zscore_false_alarms': len(set(zscore)-truth),
            'persistent_false_alarms': len(set(persistent) - truth),
            'persistent_delay_samples': min(set(persistent) & truth) - 50,
            'true_alarm_samples': len(set(persistent) & truth)}

if __name__=='__main__':
    print(json.dumps([{'case':i+1,**anomalies(53200+i)} for i in range(30)],ensure_ascii=False,indent=2))
