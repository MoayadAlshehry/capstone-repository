"""Owned deterministic synthetic demonstration. Never run by the server."""
import csv,hashlib,heapq,itertools,json,math,random,statistics,unicodedata

def water(seed):
    rng = random.Random(seed)
    branch = [rng.randint(2, 8) for _ in range(4)]
    leak = seed % 4
    residuals = [0, 0, 0, 0]; residuals[leak] = 3
    measured = [x + residuals[i] for i, x in enumerate(branch)]
    missing = seed % 5
    candidates = [i for i, (a, b) in enumerate(zip(branch, measured)) if i==missing or abs(a - b) > 1]
    assert leak in candidates
    return {'unique_correct_localization':int(len(candidates)==1 and candidates[0]==leak), 'true_branch': leak,
            'candidate_count': len(candidates), 'mass_balance_residual': sum(measured) - sum(branch)}

if __name__=='__main__':
    print(json.dumps([{'case':i+1,**water(53700+i)} for i in range(30)],ensure_ascii=False,indent=2))
