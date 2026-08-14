#!/usr/bin/env bash
# Sample curl requests for the EditEase API.
# Usage:  BASE=http://localhost:8000 ./scripts/sample_requests.sh
set -e
BASE=${BASE:-http://localhost:8000}

echo "== Health =="
curl -s $BASE/api/health | python3 -m json.tool
echo

echo "== 1. Submit retrieval (Ensembl Plants - Arabidopsis) =="
RETR=$(curl -s -X POST $BASE/api/retrieve \
    -H "Content-Type: application/json" \
    -d '{
      "source": "ensembl_plants",
      "query": "AT1G01010",
      "species": "arabidopsis_thaliana",
      "upstream_bp": 2000,
      "downstream_bp": 0,
      "region": "promoter"
    }')
echo "$RETR" | python3 -m json.tool
RETR_JOB=$(echo "$RETR" | python3 -c "import sys,json; print(json.load(sys.stdin)['job_id'])")

echo
echo "== Poll retrieval status =="
for i in $(seq 1 30); do
    STATUS=$(curl -s $BASE/api/jobs/$RETR_JOB | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
    echo "  attempt $i: $STATUS"
    [ "$STATUS" = "SUCCESS" ] || [ "$STATUS" = "FAILURE" ] && break
    sleep 2
done

echo
echo "== 2. Submit promoter analysis (chained from retrieval) =="
PROM=$(curl -s -X POST $BASE/api/promoter/analyze \
    -H "Content-Type: application/json" \
    -d "{
      \"job_id_input\": \"$RETR_JOB\",
      \"databases\": [\"plantcare\", \"plantpan\"],
      \"min_score\": 0.75
    }")
echo "$PROM" | python3 -m json.tool
PROM_JOB=$(echo "$PROM" | python3 -c "import sys,json; print(json.load(sys.stdin)['job_id'])")

echo
echo "== 3. Submit sgRNA design (with FASTA inline) =="
curl -s -X POST $BASE/api/sgrna/design \
    -H "Content-Type: application/json" \
    -d '{
      "fasta_text": ">target\nATGCGATCGATCGATCGATCGATCGATCGATCAGGTACGCGCGCGTAGCTAGCTAGCATGCGCGTAGCAGGTAGCATCGAGCATCGTACGTAGCATGCGTAGCATCGAGCATGCATCGCATG",
      "pam": "NGG",
      "guide_length": 20,
      "max_mismatches": 3,
      "top_n": 10
    }' | python3 -m json.tool

echo
echo "== 4. List files for the promoter job =="
sleep 5
curl -s $BASE/api/jobs/$PROM_JOB/files | python3 -m json.tool
